/**
 * plugins/multitenancy.ts
 *
 * Provides a per-request Drizzle instance scoped to the tenant's schema.
 * Must be registered AFTER the auth plugin so request.user is already populated.
 *
 * Registered in app.ts via: await app.register(multitenancyPlugin)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { withTenantSchema, type Database } from '@orderstack/db'

// ─── Types ────────────────────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Placeholder for tenantDb — route handlers should use getTenantDb()
     * rather than this property directly.
     */
    tenantDb?: Database
  }
}

// ─── Helper exported for route handlers ──────────────────────────────────────

/**
 * Executes `fn` within a Drizzle instance scoped to the request's tenant schema.
 *
 * withTenantSchema acquires a connection from the pool, sets search_path,
 * runs the callback, resets search_path, and releases — all within one
 * transaction-mode connection to satisfy PgBouncer transaction-mode requirements.
 *
 * Usage in route handlers:
 *   const rows = await getTenantDb(request, (db) => db.select().from(products))
 */
export async function getTenantDb<T>(
  request: FastifyRequest,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  if (!request.user) {
    throw Object.assign(new Error('Tenant context unavailable: user not authenticated'), {
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    })
  }
  // Cast fn to the broader signature accepted by withTenantSchema at runtime.
  // The Database type alias and the return type of drizzle(pool) differ only in
  // their internal $client brand — the actual query API is identical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withTenantSchema(request.user.tenantId, fn as any) as Promise<T>
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function multitenancyPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('tenantDb', undefined)

  /**
   * Lightweight guard — verify tenant context looks valid before route
   * handlers run. Actual DB connections are acquired per-query via
   * getTenantDb() / withTenantSchema().
   */
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    if (!request.user) return

    const { tenantId } = request.user
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw Object.assign(new Error('Invalid tenant context'), {
        statusCode: 400,
        code: 'INVALID_TENANT',
      })
    }
  })
}
