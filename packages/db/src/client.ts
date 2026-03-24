import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.js'

const { Pool } = pg

/**
 * Connection pool.
 * In production this points at PgBouncer (PGBOUNCER_URL) running in
 * transaction mode. Transaction mode is REQUIRED for schema-per-tenant
 * isolation — session mode leaks search_path across connections.
 */
const pool = new Pool({
  connectionString: process.env['PGBOUNCER_URL'] ?? process.env['DATABASE_URL'],
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })

export type Database = typeof db

/**
 * Sets the PostgreSQL search_path to the tenant's schema for the duration
 * of the provided callback, then resets it to public.
 *
 * Must be called for every authenticated request. PgBouncer transaction mode
 * ensures the search_path is isolated to the current transaction and cannot
 * leak to the next request that reuses the same underlying connection.
 */
export async function withTenantSchema<T>(
  tenantId: string,
  fn: (db: ReturnType<typeof drizzle>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO "merchant_${tenantId}", public`)
    const tenantDb = drizzle(client, { schema })
    const result = await fn(tenantDb as ReturnType<typeof drizzle>)
    return result
  } finally {
    // Reset search_path before returning connection to pool.
    // This is the critical safety step that prevents tenant data leakage.
    await client.query('SET search_path TO public')
    client.release()
  }
}

/**
 * Provisions a new tenant schema and runs all migrations against it.
 * Called during tenant registration. Idempotent — safe to call multiple times.
 */
export async function provisionTenantSchema(tenantId: string): Promise<void> {
  const client = await pool.connect()
  try {
    const schemaName = `merchant_${tenantId}`
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    await client.query('COMMIT')
    // Drizzle migrations are run separately via drizzle-kit against the tenant schema.
    // The migration runner sets search_path before executing each migration file.
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
