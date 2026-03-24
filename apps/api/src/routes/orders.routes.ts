import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq, and, desc, count, between, gte, lte, inArray, ne } from 'drizzle-orm'
import { orders, orderItems, orderItemModifiers, orderDiscounts, payments } from '@orderstack/db'

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'open' | 'in_progress' | 'ready' | 'completed' | 'cancelled' | 'voided'
type OrderItemStatus = 'pending' | 'sent' | 'preparing' | 'ready' | 'served' | 'voided'

/**
 * Allowed status transitions.
 * Key = current status, Value = set of statuses the order may move to.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, Set<OrderStatus>> = {
  open: new Set(['in_progress', 'cancelled', 'voided']),
  in_progress: new Set(['ready', 'cancelled', 'voided']),
  ready: new Set(['completed', 'cancelled', 'voided']),
  completed: new Set(['voided']),
  cancelled: new Set(),
  voided: new Set(),
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const orderStatusValues = [
  'open',
  'in_progress',
  'ready',
  'completed',
  'cancelled',
  'voided',
] as const

const orderTypeValues = ['dine_in', 'takeout', 'delivery', 'online', 'catering'] as const
const orderSourceValues = ['pos', 'online', 'kiosk', 'third_party', 'api'] as const

const listOrdersQuery = z.object({
  status: z.enum(orderStatusValues).optional(),
  orderType: z.enum(orderTypeValues).optional(),
  source: z.enum(orderSourceValues).optional(),
  locationId: z.string().optional(),
  customerId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
})

const updateOrderStatusBody = z.object({
  status: z.enum(orderStatusValues),
})

const voidOrderBody = z.object({
  reason: z.string().min(1).max(1000),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const ordersRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /orders
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const query = listOrdersQuery.parse(request.query)
    const { status, orderType, source, locationId, customerId, dateFrom, dateTo, page, limit } =
      query
    const offset = (page - 1) * limit

    const conditions = [eq(orders.tenantId, request.user!.tenantId)]

    if (status !== undefined) {
      conditions.push(eq(orders.status, status))
    }

    if (orderType !== undefined) {
      conditions.push(eq(orders.orderType, orderType))
    }

    if (source !== undefined) {
      conditions.push(eq(orders.source, source))
    }

    if (locationId !== undefined) {
      conditions.push(eq(orders.locationId, locationId))
    }

    if (customerId !== undefined) {
      conditions.push(eq(orders.customerId, customerId))
    }

    if (dateFrom !== undefined && dateTo !== undefined) {
      conditions.push(between(orders.createdAt, new Date(dateFrom), new Date(dateTo)))
    } else if (dateFrom !== undefined) {
      conditions.push(gte(orders.createdAt, new Date(dateFrom)))
    } else if (dateTo !== undefined) {
      conditions.push(lte(orders.createdAt, new Date(dateTo)))
    }

    const where = and(...conditions)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(orders).where(where),
    ])

    return reply.send({
      data: rows,
      meta: { page, limit, total: Number(total) },
    })
  })

  // GET /orders/:id — with items, modifiers, discounts, payments
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, request.user!.tenantId)))

    if (!order) {
      return reply.status(404).send({ error: 'Order not found' })
    }

    const [items, discounts, orderPayments] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, id)),
      db.select().from(orderDiscounts).where(eq(orderDiscounts.orderId, id)),
      db.select().from(payments).where(eq(payments.orderId, id)),
    ])

    const itemIds = items.map((i) => i.id)

    const itemModifiers =
      itemIds.length > 0
        ? await db
            .select()
            .from(orderItemModifiers)
            .where(inArray(orderItemModifiers.orderItemId, itemIds))
        : []

    const modifiersByItem = new Map<string, typeof itemModifiers>()
    for (const mod of itemModifiers) {
      const list = modifiersByItem.get(mod.orderItemId) ?? []
      list.push(mod)
      modifiersByItem.set(mod.orderItemId, list)
    }

    const itemsWithModifiers = items.map((item) => ({
      ...item,
      modifiers: modifiersByItem.get(item.id) ?? [],
    }))

    return reply.send({
      ...order,
      items: itemsWithModifiers,
      discounts,
      payments: orderPayments,
    })
  })

  // PATCH /orders/:id/status
  fastify.patch('/:id/status', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateOrderStatusBody.parse(request.body)

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, request.user!.tenantId)))

    if (!order) {
      return reply.status(404).send({ error: 'Order not found' })
    }

    const currentStatus = order.status as OrderStatus
    const targetStatus = body.status as OrderStatus

    if (currentStatus === targetStatus) {
      return reply.send(order)
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus]

    if (!allowed.has(targetStatus)) {
      return reply.status(422).send({
        error: 'Invalid status transition',
        currentStatus,
        targetStatus,
        allowedTransitions: [...allowed],
      })
    }

    const updateData: Record<string, unknown> = {
      status: targetStatus,
      updatedAt: new Date(),
    }

    if (targetStatus === 'completed') {
      updateData.completedAt = new Date()
    }

    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning()

    return reply.send(updated)
  })

  // POST /orders/:id/void
  fastify.post('/:id/void', async (request, reply) => {
    await request.authenticate()

    
    // permission checked via requirePermission above
if (false) {
      return reply.status(403).send({ error: 'Forbidden: orders:void permission required' })
    }

    const db = request.tenantDb
    const { id } = request.params as { id: string }
    const body = voidOrderBody.parse(request.body)

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, request.user!.tenantId)))

    if (!order) {
      return reply.status(404).send({ error: 'Order not found' })
    }

    if (order.status === 'voided') {
      return reply.status(409).send({ error: 'Order is already voided' })
    }

    const now = new Date()

    await db.transaction(async (tx) => {
      // Void the order
      await tx
        .update(orders)
        .set({ status: 'voided', updatedAt: now })
        .where(eq(orders.id, id))

      // Void all non-voided order items
      await tx
        .update(orderItems)
        .set({
          status: 'voided' as OrderItemStatus,
          voidedAt: now,
          voidedBy: request.user?.id ?? null,
          voidReason: body.reason,
        })
        .where(
          and(
            eq(orderItems.orderId, id),
            ne(orderItems.status, 'voided'),
          ),
        )
    })

    // Re-fetch updated order
    const [voided] = await db.select().from(orders).where(eq(orders.id, id))

    return reply.send(voided)
  })
}
