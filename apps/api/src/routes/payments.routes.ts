import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, gte, lte, count, sql, asc, desc } from 'drizzle-orm'
import { payments, refunds } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const paymentMethodValues = [
  'cash',
  'card',
  'gift_card',
  'split',
  'external',
  'online',
  'house_account',
  'loyalty_points',
] as const

const paymentStatusValues = [
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
  'cancelled',
] as const

const listPaymentsQuery = z.object({
  locationId: z.string().optional(),
  status: z.enum(paymentStatusValues).optional(),
  paymentMethod: z.enum(paymentMethodValues).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
})

const refundBody = z.object({
  amount: z.number().positive(),
  reason: z.string().optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const paymentsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /payments — list payments with filters
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const query = listPaymentsQuery.parse(request.query)
    const { locationId, status, paymentMethod, dateFrom, dateTo, page, limit } = query
    const offset = (page - 1) * limit

    const conditions = [eq(payments.tenantId, request.user!.tenantId)]

    if (locationId !== undefined) {
      conditions.push(eq(payments.locationId, locationId))
    }

    if (status !== undefined) {
      conditions.push(eq(payments.status, status))
    }

    if (paymentMethod !== undefined) {
      conditions.push(eq(payments.paymentMethod, paymentMethod))
    }

    if (dateFrom !== undefined) {
      conditions.push(gte(payments.createdAt, new Date(dateFrom)))
    }

    if (dateTo !== undefined) {
      conditions.push(lte(payments.createdAt, new Date(dateTo)))
    }

    const where = and(...conditions)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(payments)
        .where(where)
        .orderBy(desc(payments.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(payments).where(where),
    ])

    return reply.send({
      data: rows,
      meta: { page, limit, total: Number(total) },
    })
  })

  // GET /payments/:id — get payment with refunds
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.tenantId, request.user!.tenantId)))

    if (!payment) {
      return reply.status(404).send({ error: 'Payment not found' })
    }

    const paymentRefunds = await db
      .select()
      .from(refunds)
      .where(eq(refunds.paymentId, id))
      .orderBy(asc(refunds.createdAt))

    return reply.send({
      ...payment,
      refunds: paymentRefunds,
    })
  })

  // POST /payments/:id/refund — initiate a refund
  fastify.post('/:id/refund', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = refundBody.parse(request.body)

    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.tenantId, request.user!.tenantId)))

    if (!payment) {
      return reply.status(404).send({ error: 'Payment not found' })
    }

    // Only captured or partially_refunded payments can be refunded
    if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
      return reply.status(422).send({
        error: `Cannot refund a payment with status '${payment.status}'`,
      })
    }

    // Sum existing refunds
    const [{ refundedTotal }] = await db
      .select({
        refundedTotal: sql<string>`COALESCE(SUM(${refunds.amount}), 0)`,
      })
      .from(refunds)
      .where(
        and(
          eq(refunds.paymentId, id),
          // Only count succeeded refunds
          eq(refunds.status, 'succeeded'),
        ),
      )

    const paymentAmount = Number(payment.amount)
    const alreadyRefunded = Number(refundedTotal)
    const maxRefundable = paymentAmount - alreadyRefunded

    if (body.amount > maxRefundable) {
      return reply.status(422).send({
        error: `Refund amount $${body.amount.toFixed(2)} exceeds refundable balance $${maxRefundable.toFixed(2)}`,
        refundedTotal: alreadyRefunded,
        maxRefundable,
      })
    }

    const refundId = nanoid()
    const now = new Date()

    await db.transaction(async (tx) => {
      // Create the refund row
      await tx.insert(refunds).values({
        id: refundId,
        paymentId: id,
        amount: String(body.amount),
        reason: body.reason ?? null,
        // For cash payments we can immediately mark as succeeded;
        // for card/external the worker or webhook will update this via processor callback.
        status: payment.paymentMethod === 'cash' ? 'succeeded' : 'pending',
        processorRefundId: null,
        initiatedBy: request.user!.id,
        createdAt: now,
      })

      // Update payment status
      const newRefundTotal = alreadyRefunded + body.amount
      const newStatus =
        newRefundTotal >= paymentAmount ? 'refunded' : 'partially_refunded'

      await tx
        .update(payments)
        .set({
          status: newStatus,
          refundedAt: newStatus === 'refunded' ? now : payment.refundedAt,
        })
        .where(eq(payments.id, id))
    })

    const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId))

    // For non-cash payments, log that the external processor refund must be triggered separately.
    if (payment.paymentMethod !== 'cash') {
      request.log.info(
        {
          refundId,
          paymentId: id,
          processor: payment.processor,
          amount: body.amount,
        },
        'Refund row created — external processor refund must be triggered separately via payment processor API',
      )
    }

    return reply.status(201).send(refund)
  })
}
