import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { tenants, locations, db as publicDb } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateTenantBody = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.unknown()).optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const tenantsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /tenants/:id — get tenant info with locations
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    // Users may only access their own tenant
    if (id !== request.user!.tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const [tenant] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))

    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' })
    }

    const tenantLocations = await publicDb
      .select()
      .from(locations)
      .where(eq(locations.tenantId, id))

    return reply.send({
      ...tenant,
      locations: tenantLocations,
    })
  })

  // PATCH /tenants/:id — update tenant name and settings
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    // Users may only modify their own tenant
    if (id !== request.user!.tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const body = updateTenantBody.parse(request.body)

    const [existing] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))

    if (!existing) {
      return reply.status(404).send({ error: 'Tenant not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name

    if (body.settings !== undefined) {
      // Deep-merge provided settings with existing settings
      const currentSettings = (existing.settings as Record<string, unknown>) ?? {}
      updateData.settings = { ...currentSettings, ...body.settings }
    }

    const [updated] = await publicDb
      .update(tenants)
      .set(updateData)
      .where(eq(tenants.id, id))
      .returning()

    return reply.send(updated)
  })
}
