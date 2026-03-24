/**
 * routes/customers.routes.ts
 *
 * Customer management routes:
 *   GET    /customers/search              — quick search (top 10)
 *   GET    /customers                     — list (paginated)
 *   POST   /customers                     — create
 *   GET    /customers/:id                 — get with tags + visit summary
 *   PATCH  /customers/:id                 — update
 *   DELETE /customers/:id                 — delete (cascade via FK)
 *   GET    /customers/:id/orders          — list orders (paginated)
 *   GET    /customers/:id/loyalty         — loyalty accounts with tier info
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, ilike, or, inArray, sql } from 'drizzle-orm'
import {
  customers,
  customerTags,
  customerTagAssignments,
  customerVisits,
  orders,
  loyaltyAccounts,
  loyaltyPrograms,
  loyaltyTiers,
} from '@orderstack/db'
import { getTenantDb } from '../plugins/multitenancy.js'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listCustomersQuery = z.object({
  search: z.string().optional(),
  tagId: z.string().optional(),
  segmentId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const createCustomerBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  anniversary: z.string().optional(),
  address: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  marketingOptIn: z.boolean().default(false),
  source: z.string().optional(),
})

const updateCustomerBody = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  anniversary: z.string().nullable().optional(),
  address: z.record(z.unknown()).nullable().optional(),
  notes: z.string().nullable().optional(),
  marketingOptIn: z.boolean().optional(),
  source: z.string().nullable().optional(),
})

const listOrdersQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const quickSearchQuery = z.object({
  q: z.string().min(1),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function customersRoutes(fastify: FastifyInstance) {
  // ── GET /customers/search — must be registered before /:id ───────────────

  fastify.get('/search', async (request, reply) => {
    await request.authenticate()

    const query = quickSearchQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: 'q query parameter is required' })
    }

    const { q } = query.data
    const pattern = `%${q}%`

    const rows = await getTenantDb(request, (db) =>
      db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
        })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, request.user!.tenantId),
            or(
              ilike(customers.firstName, pattern),
              ilike(customers.lastName, pattern),
              ilike(customers.email, pattern),
              ilike(customers.phone, pattern),
            )!,
          ),
        )
        .limit(10),
    )

    return reply.send({ data: rows })
  })

  // ── GET /customers ────────────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const query = listCustomersQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { search, tagId, page, limit } = query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, async (db) => {
      const conditions = [eq(customers.tenantId, request.user!.tenantId)]

      if (search) {
        const pattern = `%${search}%`
        conditions.push(
          or(
            ilike(customers.firstName, pattern),
            ilike(customers.lastName, pattern),
            ilike(customers.email, pattern),
            ilike(customers.phone, pattern),
          )!,
        )
      }

      if (tagId) {
        // Find customers that have the given tag
        const taggedCustomerIds = await db
          .select({ customerId: customerTagAssignments.customerId })
          .from(customerTagAssignments)
          .where(eq(customerTagAssignments.tagId, tagId))

        if (taggedCustomerIds.length === 0) {
          return []
        }

        conditions.push(
          inArray(
            customers.id,
            taggedCustomerIds.map((r) => r.customerId),
          ),
        )
      }

      return db
        .select()
        .from(customers)
        .where(and(...conditions))
        .orderBy(customers.lastName, customers.firstName)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── POST /customers ───────────────────────────────────────────────────────

  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createCustomerBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const customer = await getTenantDb(request, async (db) => {
      const id = nanoid()

      await db.insert(customers).values({
        id,
        tenantId: request.user!.tenantId,
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        email: body.data.email ?? null,
        phone: body.data.phone ?? null,
        birthday: body.data.birthday ?? null,
        anniversary: body.data.anniversary ?? null,
        address: body.data.address ?? null,
        notes: body.data.notes ?? null,
        marketingOptIn: body.data.marketingOptIn,
        source: body.data.source ?? null,
      })

      const [created] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, id))
        .limit(1)

      return created
    })

    return reply.status(201).send({ data: customer })
  })

  // ── GET /customers/:id ────────────────────────────────────────────────────

  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const result = await getTenantDb(request, async (db) => {
      const customerRows = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.user!.tenantId)))
        .limit(1)

      if (customerRows.length === 0) return null

      const customer = customerRows[0]!

      // Fetch tags
      const tagRows = await db
        .select({
          id: customerTags.id,
          name: customerTags.name,
          color: customerTags.color,
        })
        .from(customerTagAssignments)
        .innerJoin(customerTags, eq(customerTagAssignments.tagId, customerTags.id))
        .where(eq(customerTagAssignments.customerId, id))

      // Visit summary via aggregation
      const visitSummaryRows = await db
        .select({
          totalVisits: sql<number>`COUNT(*)::int`,
          totalSpend: sql<string>`COALESCE(SUM(spend_amount), 0)`,
          lastVisit: sql<Date | null>`MAX(visit_date)`,
          avgSpend: sql<string>`COALESCE(AVG(spend_amount), 0)`,
        })
        .from(customerVisits)
        .where(eq(customerVisits.customerId, id))

      const summary = visitSummaryRows[0] ?? {
        totalVisits: 0,
        totalSpend: '0',
        lastVisit: null,
        avgSpend: '0',
      }

      return {
        ...customer,
        tags: tagRows,
        visitSummary: {
          totalVisits: summary.totalVisits,
          totalSpend: parseFloat(summary.totalSpend as string),
          lastVisit: summary.lastVisit,
          avgSpend: parseFloat(summary.avgSpend as string),
        },
      }
    })

    if (!result) {
      return reply.status(404).send({ error: 'Customer not found' })
    }

    return reply.send({ data: result })
  })

  // ── PATCH /customers/:id ──────────────────────────────────────────────────

  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = updateCustomerBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const updated = await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
      }

      const d = body.data
      const updates: Record<string, unknown> = { updatedAt: new Date() }

      if (d.firstName !== undefined) updates.firstName = d.firstName
      if (d.lastName !== undefined) updates.lastName = d.lastName
      if (d.email !== undefined) updates.email = d.email
      if (d.phone !== undefined) updates.phone = d.phone
      if (d.birthday !== undefined) updates.birthday = d.birthday
      if (d.anniversary !== undefined) updates.anniversary = d.anniversary
      if (d.address !== undefined) updates.address = d.address
      if (d.notes !== undefined) updates.notes = d.notes
      if (d.marketingOptIn !== undefined) updates.marketingOptIn = d.marketingOptIn
      if (d.source !== undefined) updates.source = d.source

      const [row] = await db
        .update(customers)
        .set(updates)
        .where(eq(customers.id, id))
        .returning()

      return row
    })

    return reply.send({ data: updated })
  })

  // ── DELETE /customers/:id ─────────────────────────────────────────────────

  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
      }

      // ON DELETE CASCADE handles child rows (visits, tag assignments, loyalty accounts, etc.)
      await db.delete(customers).where(eq(customers.id, id))
    })

    return reply.status(204).send()
  })

  // ── GET /customers/:id/orders ─────────────────────────────────────────────

  fastify.get('/:id/orders', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const query = listOrdersQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { page, limit } = query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, async (db) => {
      // Verify customer belongs to tenant
      const customerRows = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.user!.tenantId)))
        .limit(1)

      if (customerRows.length === 0) {
        throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
      }

      return db
        .select()
        .from(orders)
        .where(eq(orders.customerId, id))
        .orderBy(sql`${orders.createdAt} DESC`)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── GET /customers/:id/loyalty ────────────────────────────────────────────

  fastify.get('/:id/loyalty', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const accounts = await getTenantDb(request, async (db) => {
      // Verify customer belongs to tenant
      const customerRows = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.user!.tenantId)))
        .limit(1)

      if (customerRows.length === 0) {
        throw Object.assign(new Error('Customer not found'), { statusCode: 404 })
      }

      return db
        .select({
          id: loyaltyAccounts.id,
          customerId: loyaltyAccounts.customerId,
          programId: loyaltyAccounts.programId,
          pointsBalance: loyaltyAccounts.pointsBalance,
          lifetimePoints: loyaltyAccounts.lifetimePoints,
          visitsCount: loyaltyAccounts.visitsCount,
          lifetimeSpend: loyaltyAccounts.lifetimeSpend,
          tierId: loyaltyAccounts.tierId,
          enrolledAt: loyaltyAccounts.enrolledAt,
          lastActivityAt: loyaltyAccounts.lastActivityAt,
          programName: loyaltyPrograms.name,
          programType: loyaltyPrograms.type,
          programIsActive: loyaltyPrograms.isActive,
          tierName: loyaltyTiers.name,
          tierMinPoints: loyaltyTiers.minPoints,
          tierMinSpend: loyaltyTiers.minSpend,
          tierBenefits: loyaltyTiers.benefits,
          tierSortOrder: loyaltyTiers.sortOrder,
        })
        .from(loyaltyAccounts)
        .innerJoin(loyaltyPrograms, eq(loyaltyAccounts.programId, loyaltyPrograms.id))
        .leftJoin(loyaltyTiers, eq(loyaltyAccounts.tierId, loyaltyTiers.id))
        .where(eq(loyaltyAccounts.customerId, id))
        .orderBy(loyaltyPrograms.name)
    })

    return reply.send({ data: accounts })
  })
}
