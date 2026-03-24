import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, or, ilike, asc, desc, count } from 'drizzle-orm'
import { giftCards, giftCardTransactions } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const giftCardStatusValues = ['active', 'inactive', 'exhausted'] as const

const listGiftCardsQuery = z.object({
  status: z.enum(giftCardStatusValues).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
})

const createGiftCardBody = z.object({
  code: z.string().min(4).max(64).optional(),
  initialBalance: z.number().positive(),
  purchasedByCustomerId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
})

const updateGiftCardBody = z.object({
  status: z.enum(giftCardStatusValues).optional(),
})

const reloadBody = z.object({
  amount: z.number().positive(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a human-readable gift card code in the format XXXX-XXXX-XXXX-XXXX
 * using uppercase alphanumeric characters (without ambiguous 0/O, 1/I/L).
 */
function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${segment()}-${segment()}-${segment()}-${segment()}`
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const giftCardsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /gift-cards — list with optional filters
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const query = listGiftCardsQuery.parse(request.query)
    const { status, search, page, limit } = query
    const offset = (page - 1) * limit

    const conditions = [eq(giftCards.tenantId, request.user!.tenantId)]

    if (status !== undefined) {
      conditions.push(eq(giftCards.status, status))
    }

    if (search) {
      conditions.push(ilike(giftCards.code, `%${search}%`))
    }

    const where = and(...conditions)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(giftCards)
        .where(where)
        .orderBy(desc(giftCards.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(giftCards).where(where),
    ])

    return reply.send({
      data: rows,
      meta: { page, limit, total: Number(total) },
    })
  })

  // POST /gift-cards — create and activate
  fastify.post('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createGiftCardBody.parse(request.body)
    const id = nanoid()
    const code = body.code ?? generateGiftCardCode()
    const now = new Date()

    // Ensure code uniqueness within tenant
    const [existingCard] = await db
      .select()
      .from(giftCards)
      .where(and(eq(giftCards.tenantId, request.user!.tenantId), eq(giftCards.code, code)))

    if (existingCard) {
      return reply.status(409).send({ error: 'Gift card code already exists' })
    }

    const initialBalanceStr = String(body.initialBalance)

    await db.insert(giftCards).values({
      id,
      tenantId: request.user!.tenantId,
      code,
      initialBalance: initialBalanceStr,
      currentBalance: initialBalanceStr,
      status: 'active',
      purchasedByCustomerId: body.purchasedByCustomerId ?? null,
      activatedAt: now,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdAt: now,
    })

    // Record the initial LOAD transaction
    await db.insert(giftCardTransactions).values({
      id: nanoid(),
      giftCardId: id,
      orderId: null,
      transactionType: 'load',
      amount: initialBalanceStr,
      balanceAfter: initialBalanceStr,
      createdAt: now,
    })

    const [card] = await db.select().from(giftCards).where(eq(giftCards.id, id))

    return reply.status(201).send(card)
  })

  // PATCH /gift-cards/:id — update status
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateGiftCardBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(giftCards)
      .where(and(eq(giftCards.id, id), eq(giftCards.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Gift card not found' })
    }

    const updateData: Record<string, unknown> = {}

    if (body.status !== undefined) updateData.status = body.status

    if (Object.keys(updateData).length === 0) {
      return reply.send(existing)
    }

    const [updated] = await db
      .update(giftCards)
      .set(updateData)
      .where(eq(giftCards.id, id))
      .returning()

    return reply.send(updated)
  })

  // POST /gift-cards/:code/reload — reload balance
  fastify.post('/:code/reload', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { code } = request.params as { code: string }
    const body = reloadBody.parse(request.body)

    const [card] = await db
      .select()
      .from(giftCards)
      .where(and(eq(giftCards.code, code), eq(giftCards.tenantId, request.user!.tenantId)))

    if (!card) {
      return reply.status(404).send({ error: 'Gift card not found' })
    }

    if (card.status === 'inactive') {
      return reply.status(422).send({ error: 'Cannot reload an inactive gift card' })
    }

    const now = new Date()
    const currentBalance = Number(card.currentBalance)
    const newBalance = currentBalance + body.amount
    const newBalanceStr = String(newBalance)

    await db.transaction(async (tx) => {
      // Create the LOAD transaction
      await tx.insert(giftCardTransactions).values({
        id: nanoid(),
        giftCardId: card.id,
        orderId: null,
        transactionType: 'load',
        amount: String(body.amount),
        balanceAfter: newBalanceStr,
        createdAt: now,
      })

      // Update the current balance; if card was exhausted, reactivate it
      await tx
        .update(giftCards)
        .set({
          currentBalance: newBalanceStr,
          status: card.status === 'exhausted' ? 'active' : card.status,
        })
        .where(eq(giftCards.id, card.id))
    })

    const [updatedCard] = await db.select().from(giftCards).where(eq(giftCards.id, card.id))

    return reply.status(201).send(updatedCard)
  })
}
