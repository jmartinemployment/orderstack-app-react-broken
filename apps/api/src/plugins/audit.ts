/**
 * plugins/audit.ts
 *
 * Writes one row to audit_log for every successful mutating request (POST,
 * PATCH, DELETE returning 2xx).
 *
 * Route handlers attach audit snapshots before returning:
 *   request.auditBefore = <record before mutation>   (PATCH / DELETE)
 *   request.auditAfter  = <record after mutation>    (POST / PATCH)
 *
 * Resource type derivation examples:
 *   /v1/products/abc     → 'product'
 *   /v1/purchase-orders  → 'purchase-order'
 *   /v1/gift-cards/xyz   → 'gift-card'
 *
 * This plugin never throws. Audit failures are logged and swallowed so they
 * never affect the caller's response.
 *
 * Registered in app.ts via: await app.register(auditPlugin)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { nanoid } from 'nanoid'
import { withTenantSchema, auditLog } from '@orderstack/db'

// ─── Types ────────────────────────────────────────────────────────────────────

type MutatingMethod = 'POST' | 'PATCH' | 'DELETE'
type AuditAction = 'create' | 'update' | 'delete'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_TO_ACTION: Record<MutatingMethod, AuditAction> = {
  POST: 'create',
  PATCH: 'update',
  DELETE: 'delete',
}

const MUTATING_METHODS = new Set<string>(['POST', 'PATCH', 'DELETE'])

/**
 * Derives a singular kebab-case resource type from the URL path.
 *
 * Strips the /v1/ prefix, takes the first path segment (the collection name),
 * and removes a trailing 's' to singularise simple English plurals.
 *
 * This is intentionally simple and handles the standard REST patterns used in
 * this codebase. Irregular plurals (e.g. "access-logs") would need manual
 * overrides in the route handler via a custom resource type, but none exist
 * in the current route set.
 */
function resourceTypeFromPath(url: string): string {
  const pathname = url.split('?')[0]!
  const parts = pathname.split('/').filter((p) => p && p !== 'v1')
  if (parts.length === 0) return 'unknown'
  const segment = parts[0]!
  // De-pluralise: remove trailing 's' (products→product, orders→order, etc.)
  return segment.replace(/s$/, '')
}

/**
 * Extracts the :id param from the parsed request params if present.
 */
function resourceIdFromParams(params: unknown): string | undefined {
  if (params !== null && typeof params === 'object' && 'id' in params) {
    const id = (params as Record<string, unknown>)['id']
    if (typeof id === 'string' && id.length > 0) return id
  }
  return undefined
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function auditPlugin(fastify: FastifyInstance) {
  fastify.addHook(
    'onResponse',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const method = request.method.toUpperCase()

        if (!MUTATING_METHODS.has(method)) return

        const status = reply.statusCode
        if (status < 200 || status >= 300) return

        const user = request.user
        if (!user) return

        const action = METHOD_TO_ACTION[method as MutatingMethod]
        const resourceType = resourceTypeFromPath(request.url)
        // For POST/create we may not have an :id — fall back to a new nanoid so
        // the row is always insertable (audit_log.resource_id is NOT NULL).
        const resourceId = resourceIdFromParams(request.params) ?? nanoid()

        await withTenantSchema(user.tenantId, async (tdb) => {
          await tdb.insert(auditLog).values({
            id: nanoid(),
            tenantId: user.tenantId,
            userId: user.id,
            deviceId: request.device?.id ?? null,
            resourceType,
            resourceId,
            action,
            before: (request.auditBefore ?? null) as Record<string, unknown> | null,
            after: (request.auditAfter ?? null) as Record<string, unknown> | null,
            ipAddress: request.ip,
          })
        })
      } catch (err) {
        // Audit failures must never surface to the caller.
        request.log.error(
          { err, url: request.url, method: request.method },
          'Audit log write failed',
        )
      }
    },
  )
}
