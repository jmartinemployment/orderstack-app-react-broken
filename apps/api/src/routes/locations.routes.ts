import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { locations, tenants, db as publicDb } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
})

const createLocationBody = z.object({
  name: z.string().min(1).max(255),
  address: addressSchema.optional().default({}),
  timezone: z.string().optional().default('America/New_York'),
  currency: z.string().length(3).optional().default('USD'),
  taxConfig: z.record(z.unknown()).optional().default({}),
  phone: z.string().optional(),
  email: z.string().email().optional(),
})

const updateLocationBody = z.object({
  name: z.string().min(1).max(255).optional(),
  address: addressSchema.optional(),
  timezone: z.string().optional(),
  currency: z.string().length(3).optional(),
  taxConfig: z.record(z.unknown()).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  isActive: z.boolean().optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const locationsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /locations/:id — get location detail
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const [location] = await publicDb
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, id),
          eq(locations.tenantId, request.user!.tenantId),
        ),
      )

    if (!location) {
      return reply.status(404).send({ error: 'Location not found' })
    }

    return reply.send(location)
  })

  // PATCH /locations/:id — update location fields
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }
    const body = updateLocationBody.parse(request.body)

    const [existing] = await publicDb
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, id),
          eq(locations.tenantId, request.user!.tenantId),
        ),
      )

    if (!existing) {
      return reply.status(404).send({ error: 'Location not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.address !== undefined) updateData.address = body.address
    if (body.timezone !== undefined) updateData.timezone = body.timezone
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.taxConfig !== undefined) updateData.taxConfig = body.taxConfig
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.email !== undefined) updateData.email = body.email
    if (body.isActive !== undefined) updateData.isActive = String(body.isActive)

    const [updated] = await publicDb
      .update(locations)
      .set(updateData)
      .where(eq(locations.id, id))
      .returning()

    return reply.send(updated)
  })

  // POST /tenants/:tenantId/locations — create new location under tenant
  fastify.post('/tenants/:tenantId/locations', async (request, reply) => {
    await request.authenticate()

    const { tenantId } = request.params as { tenantId: string }

    // Users may only create locations for their own tenant
    if (tenantId !== request.user!.tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Verify tenant exists
    const [tenant] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))

    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' })
    }

    const body = createLocationBody.parse(request.body)
    const id = nanoid()
    const now = new Date()

    await publicDb.insert(locations).values({
      id,
      tenantId,
      name: body.name,
      address: body.address ?? {},
      timezone: body.timezone ?? 'America/New_York',
      currency: body.currency ?? 'USD',
      taxConfig: body.taxConfig ?? {},
      phone: body.phone ?? null,
      email: body.email ?? null,
      isActive: 'true',
      createdAt: now,
      updatedAt: now,
    })

    const [location] = await publicDb
      .select()
      .from(locations)
      .where(eq(locations.id, id))

    return reply.status(201).send(location)
  })
}
