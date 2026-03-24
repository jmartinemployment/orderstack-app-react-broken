import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, desc, count } from 'drizzle-orm'
import crypto from 'node:crypto'
import { webhookEndpoints, webhookDeliveries, db as publicDb } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createEndpointBody = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
})

const updateEndpointBody = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
})

const listDeliveriesQuery = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a secure HMAC signing secret for webhook delivery.
 * Returns the raw secret (shown once to the caller) and its SHA-256 hash (stored).
 */
function generateWebhookSecret(): { secret: string; hash: string } {
  const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`
  const hash = crypto.createHash('sha256').update(secret).digest('hex')
  return { secret, hash }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const webhooksRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /webhooks — list webhook endpoints for tenant
  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const endpoints = await publicDb
      .select({
        id: webhookEndpoints.id,
        tenantId: webhookEndpoints.tenantId,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
        // Never return secretHash
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.tenantId, request.user!.tenantId))
      .orderBy(desc(webhookEndpoints.createdAt))

    return reply.send({ data: endpoints })
  })

  // POST /webhooks — create endpoint with generated HMAC secret
  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createEndpointBody.parse(request.body)
    const id = nanoid()
    const now = new Date()
    const { secret, hash } = generateWebhookSecret()

    await publicDb.insert(webhookEndpoints).values({
      id,
      tenantId: request.user!.tenantId,
      url: body.url,
      events: body.events,
      secretHash: hash,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    })

    const [endpoint] = await publicDb
      .select({
        id: webhookEndpoints.id,
        tenantId: webhookEndpoints.tenantId,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, id))

    // Return the full secret ONCE — caller must store it securely
    return reply.status(201).send({
      ...endpoint,
      secret, // shown only once; stored as hash
    })
  })

  // PATCH /webhooks/:id — update url, events, isActive
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }
    const body = updateEndpointBody.parse(request.body)

    const [existing] = await publicDb
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.tenantId, request.user!.tenantId),
        ),
      )

    if (!existing) {
      return reply.status(404).send({ error: 'Webhook endpoint not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.url !== undefined) updateData.url = body.url
    if (body.events !== undefined) updateData.events = body.events
    if (body.isActive !== undefined) updateData.isActive = body.isActive ? 1 : 0

    const [updated] = await publicDb
      .update(webhookEndpoints)
      .set(updateData)
      .where(eq(webhookEndpoints.id, id))
      .returning({
        id: webhookEndpoints.id,
        tenantId: webhookEndpoints.tenantId,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        isActive: webhookEndpoints.isActive,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })

    return reply.send(updated)
  })

  // DELETE /webhooks/:id — delete endpoint
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const [existing] = await publicDb
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.tenantId, request.user!.tenantId),
        ),
      )

    if (!existing) {
      return reply.status(404).send({ error: 'Webhook endpoint not found' })
    }

    await publicDb.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id))

    return reply.status(204).send()
  })

  // GET /webhooks/:id/deliveries — list delivery attempts, paginated
  fastify.get('/:id/deliveries', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }
    const query = listDeliveriesQuery.parse(request.query)
    const { page, limit } = query
    const offset = (page - 1) * limit

    // Verify endpoint belongs to this tenant
    const [endpoint] = await publicDb
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.tenantId, request.user!.tenantId),
        ),
      )

    if (!endpoint) {
      return reply.status(404).send({ error: 'Webhook endpoint not found' })
    }

    const [rows, [{ total }]] = await Promise.all([
      publicDb
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, id))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(limit)
        .offset(offset),
      publicDb
        .select({ total: count() })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, id)),
    ])

    return reply.send({
      data: rows,
      meta: { page, limit, total: Number(total) },
    })
  })
}
