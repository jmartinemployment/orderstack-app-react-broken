import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, desc } from 'drizzle-orm'
import crypto from 'node:crypto'
import { apiKeys, db as publicDb } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createApiKeyBody = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Hashes a raw API key using SHA-256 for secure storage.
 * We store the hash; the raw key is returned to the caller only once.
 */
function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex')
}

/**
 * Extracts the prefix from an API key (first 12 characters after 'osk_').
 * Used for display purposes so admins can identify which key is which.
 */
function extractPrefix(rawKey: string): string {
  // e.g. osk_<32 chars> → prefix is first 8 chars of the payload
  return rawKey.slice(0, 12) // e.g. "osk_AbCdEfGh"
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const apiKeysRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api-keys — list active API keys (prefix only, never full key)
  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const keys = await publicDb
      .select({
        id: apiKeys.id,
        tenantId: apiKeys.tenantId,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        isActive: apiKeys.isActive,
        createdBy: apiKeys.createdBy,
        createdAt: apiKeys.createdAt,
        // keyHash is never returned
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.tenantId, request.user!.tenantId),
          eq(apiKeys.isActive, 1),
        ),
      )
      .orderBy(desc(apiKeys.createdAt))

    return reply.send({ data: keys })
  })

  // POST /api-keys — create a new API key; full key returned only once
  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createApiKeyBody.parse(request.body)
    const id = nanoid()
    const now = new Date()

    // Generate key: 'osk_' + nanoid(32)
    const rawKey = `osk_${nanoid(32)}`
    const keyPrefix = extractPrefix(rawKey)
    const keyHash = hashApiKey(rawKey)

    await publicDb.insert(apiKeys).values({
      id,
      tenantId: request.user!.tenantId,
      name: body.name,
      keyPrefix,
      keyHash,
      scopes: body.scopes,
      lastUsedAt: null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      isActive: 1,
      createdBy: request.user!.id,
      createdAt: now,
    })

    const [created] = await publicDb
      .select({
        id: apiKeys.id,
        tenantId: apiKeys.tenantId,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        isActive: apiKeys.isActive,
        createdBy: apiKeys.createdBy,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, id))

    // Return the full key ONCE — caller must store it securely
    return reply.status(201).send({
      ...created,
      key: rawKey, // shown only once
    })
  })

  // DELETE /api-keys/:id — revoke key (set isActive = 0)
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const [existing] = await publicDb
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, id),
          eq(apiKeys.tenantId, request.user!.tenantId),
        ),
      )

    if (!existing) {
      return reply.status(404).send({ error: 'API key not found' })
    }

    if (existing.isActive === 0) {
      return reply.status(409).send({ error: 'API key is already revoked' })
    }

    await publicDb
      .update(apiKeys)
      .set({ isActive: 0 })
      .where(eq(apiKeys.id, id))

    return reply.status(204).send()
  })
}
