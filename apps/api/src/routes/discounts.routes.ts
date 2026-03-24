import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, or, ilike, asc, desc, count, sql } from 'drizzle-orm'
import { discounts, discountUsage } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const discountTypeValues = ['percentage', 'fixed_amount', 'bogo', 'combo', 'free_item'] as const
const discountScopeValues = ['order', 'item', 'category'] as const

const createDiscountBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(discountTypeValues),
  value: z.number().nonnegative(),
  scope: z.enum(discountScopeValues).optional().default('order'),
  requiresCode: z.boolean().optional().default(false),
  code: z.string().optional(),
  maxUses: z.number().int().positive().optional(),
  maxUsesPerCustomer: z.number().int().positive().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  applicableCategories: z.array(z.string()).optional().default([]),
  applicableProducts: z.array(z.string()).optional().default([]),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
})

const updateDiscountBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(discountTypeValues).optional(),
  value: z.number().nonnegative().optional(),
  scope: z.enum(discountScopeValues).optional(),
  requiresCode: z.boolean().optional(),
  code: z.string().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  maxUsesPerCustomer: z.number().int().positive().nullable().optional(),
  minOrderAmount: z.number().nonnegative().nullable().optional(),
  applicableCategories: z.array(z.string()).optional(),
  applicableProducts: z.array(z.string()).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
})

const listDiscountsQuery = z.object({
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  type: z.enum(discountTypeValues).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const discountsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /discounts — list discounts
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const query = listDiscountsQuery.parse(request.query)
    const { isActive, type, search, page, limit } = query
    const offset = (page - 1) * limit

    const conditions = [eq(discounts.tenantId, request.user!.tenantId)]

    if (isActive !== undefined) {
      conditions.push(eq(discounts.isActive, isActive ? '1' : '0'))
    }

    if (type !== undefined) {
      conditions.push(eq(discounts.type, type))
    }

    if (search) {
      conditions.push(
        or(
          ilike(discounts.name, `%${search}%`),
          ilike(discounts.code, `%${search}%`),
        )!,
      )
    }

    const where = and(...conditions)

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(discounts)
        .where(where)
        .orderBy(desc(discounts.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(discounts).where(where),
    ])

    return reply.send({
      data: rows,
      meta: { page, limit, total: Number(total) },
    })
  })

  // POST /discounts — create
  fastify.post('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createDiscountBody.parse(request.body)
    const id = nanoid()
    const now = new Date()

    await db.insert(discounts).values({
      id,
      tenantId: request.user!.tenantId,
      name: body.name,
      type: body.type,
      value: String(body.value),
      scope: body.scope,
      requiresCode: body.requiresCode ? '1' : '0',
      code: body.code ?? null,
      maxUses: body.maxUses ?? null,
      usesCount: 0,
      maxUsesPerCustomer: body.maxUsesPerCustomer ?? null,
      minOrderAmount: body.minOrderAmount != null ? String(body.minOrderAmount) : null,
      applicableCategories: body.applicableCategories ?? [],
      applicableProducts: body.applicableProducts ?? [],
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      daysOfWeek: body.daysOfWeek ?? null,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      isActive: '1',
      createdBy: request.user!.id,
      createdAt: now,
      updatedAt: now,
    })

    const [discount] = await db.select().from(discounts).where(eq(discounts.id, id))

    return reply.status(201).send(discount)
  })

  // GET /discounts/:id — get with usage stats
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [discount] = await db
      .select()
      .from(discounts)
      .where(and(eq(discounts.id, id), eq(discounts.tenantId, request.user!.tenantId)))

    if (!discount) {
      return reply.status(404).send({ error: 'Discount not found' })
    }

    // Aggregate usage stats
    const [usageStats] = await db
      .select({
        totalUses: count(),
        totalAmountSaved: sql<string>`COALESCE(SUM(${discountUsage.amountSaved}), 0)`,
        uniqueCustomers: sql<string>`COUNT(DISTINCT ${discountUsage.customerId})`,
      })
      .from(discountUsage)
      .where(eq(discountUsage.discountId, id))

    return reply.send({
      ...discount,
      usageStats: {
        totalUses: Number(usageStats?.totalUses ?? 0),
        totalAmountSaved: Number(usageStats?.totalAmountSaved ?? 0),
        uniqueCustomers: Number(usageStats?.uniqueCustomers ?? 0),
      },
    })
  })

  // PATCH /discounts/:id — update
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateDiscountBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(discounts)
      .where(and(eq(discounts.id, id), eq(discounts.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Discount not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.type !== undefined) updateData.type = body.type
    if (body.value !== undefined) updateData.value = String(body.value)
    if (body.scope !== undefined) updateData.scope = body.scope
    if (body.requiresCode !== undefined) updateData.requiresCode = body.requiresCode ? '1' : '0'
    if (body.code !== undefined) updateData.code = body.code
    if (body.maxUses !== undefined) updateData.maxUses = body.maxUses
    if (body.maxUsesPerCustomer !== undefined)
      updateData.maxUsesPerCustomer = body.maxUsesPerCustomer
    if (body.minOrderAmount !== undefined)
      updateData.minOrderAmount =
        body.minOrderAmount != null ? String(body.minOrderAmount) : null
    if (body.applicableCategories !== undefined)
      updateData.applicableCategories = body.applicableCategories
    if (body.applicableProducts !== undefined)
      updateData.applicableProducts = body.applicableProducts
    if (body.startDate !== undefined)
      updateData.startDate = body.startDate ? new Date(body.startDate) : null
    if (body.endDate !== undefined)
      updateData.endDate = body.endDate ? new Date(body.endDate) : null
    if (body.daysOfWeek !== undefined) updateData.daysOfWeek = body.daysOfWeek
    if (body.startTime !== undefined) updateData.startTime = body.startTime
    if (body.endTime !== undefined) updateData.endTime = body.endTime
    if (body.isActive !== undefined) updateData.isActive = body.isActive ? '1' : '0'

    const [updated] = await db
      .update(discounts)
      .set(updateData)
      .where(eq(discounts.id, id))
      .returning()

    return reply.send(updated)
  })

  // DELETE /discounts/:id — soft delete
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [existing] = await db
      .select()
      .from(discounts)
      .where(and(eq(discounts.id, id), eq(discounts.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Discount not found' })
    }

    await db
      .update(discounts)
      .set({ isActive: '0', updatedAt: new Date() })
      .where(eq(discounts.id, id))

    return reply.status(204).send()
  })
}
