/**
 * routes/vendors.routes.ts
 *
 * Vendor management routes (full CRUD):
 *   GET    /vendors       — list (search, paginated)
 *   POST   /vendors       — create
 *   GET    /vendors/:id   — get by ID
 *   PATCH  /vendors/:id   — update
 *   DELETE /vendors/:id   — soft delete (isActive = false)
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, ilike, or, sql } from 'drizzle-orm'
import { vendors } from '@orderstack/db'
import { getTenantDb } from '../plugins/multitenancy.js'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listVendorsQuery = z.object({
  search: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const createVendorBody = z.object({
  name: z.string().min(1).max(255),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
})

const updateVendorBody = z.object({
  name: z.string().min(1).max(255).optional(),
  contactName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function vendorsRoutes(fastify: FastifyInstance) {
  // ── GET /vendors ──────────────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const query = listVendorsQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { search, isActive, page, limit } = query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, (db) => {
      const conditions = [eq(vendors.tenantId, request.user!.tenantId)]

      if (isActive !== undefined) {
        conditions.push(eq(vendors.isActive, isActive))
      }

      if (search) {
        const pattern = `%${search}%`
        conditions.push(
          or(
            ilike(vendors.name, pattern),
            ilike(vendors.contactName, pattern),
            ilike(vendors.email, pattern),
          )!,
        )
      }

      return db
        .select()
        .from(vendors)
        .where(and(...conditions))
        .orderBy(vendors.name)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── POST /vendors ─────────────────────────────────────────────────────────

  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createVendorBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const vendor = await getTenantDb(request, async (db) => {
      const id = nanoid()

      await db.insert(vendors).values({
        id,
        tenantId: request.user!.tenantId,
        name: body.data.name,
        contactName: body.data.contactName ?? null,
        email: body.data.email ?? null,
        phone: body.data.phone ?? null,
        address: body.data.address ?? null,
        paymentTerms: body.data.paymentTerms ?? null,
        notes: body.data.notes ?? null,
        isActive: true,
      })

      const [created] = await db
        .select()
        .from(vendors)
        .where(eq(vendors.id, id))
        .limit(1)

      return created
    })

    return reply.status(201).send({ data: vendor })
  })

  // ── GET /vendors/:id ──────────────────────────────────────────────────────

  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const vendor = await getTenantDb(request, async (db) => {
      const rows = await db
        .select()
        .from(vendors)
        .where(and(eq(vendors.id, id), eq(vendors.tenantId, request.user!.tenantId)))
        .limit(1)

      return rows[0] ?? null
    })

    if (!vendor) {
      return reply.status(404).send({ error: 'Vendor not found' })
    }

    return reply.send({ data: vendor })
  })

  // ── PATCH /vendors/:id ────────────────────────────────────────────────────

  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = updateVendorBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const updated = await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.id, id), eq(vendors.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Vendor not found'), { statusCode: 404 })
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() }
      const d = body.data

      if (d.name !== undefined) updates.name = d.name
      if (d.contactName !== undefined) updates.contactName = d.contactName
      if (d.email !== undefined) updates.email = d.email
      if (d.phone !== undefined) updates.phone = d.phone
      if (d.address !== undefined) updates.address = d.address
      if (d.paymentTerms !== undefined) updates.paymentTerms = d.paymentTerms
      if (d.notes !== undefined) updates.notes = d.notes
      if (d.isActive !== undefined) updates.isActive = d.isActive

      const [row] = await db
        .update(vendors)
        .set(updates)
        .where(eq(vendors.id, id))
        .returning()

      return row
    })

    return reply.send({ data: updated })
  })

  // ── DELETE /vendors/:id ───────────────────────────────────────────────────

  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.id, id), eq(vendors.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Vendor not found'), { statusCode: 404 })
      }

      await db
        .update(vendors)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(vendors.id, id))
    })

    return reply.status(204).send()
  })
}
