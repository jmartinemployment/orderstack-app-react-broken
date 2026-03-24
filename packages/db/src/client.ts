import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.js'

const { Pool } = pg

/**
 * Connection pool.
 *
 * DATABASE_URL must point at the Supabase Supavisor pooler in transaction mode.
 * Supavisor is Supabase's built-in connection pooler (equivalent to PgBouncer
 * in transaction mode). Transaction mode is REQUIRED for schema-per-tenant
 * isolation — session mode leaks search_path across connections.
 *
 * Supabase pooler URL format:
 *   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 *
 * DIRECT_URL is used only by Drizzle Kit for migrations — it bypasses the
 * pooler and connects directly to the database.
 *
 * Both values are set as environment variables in Render.com's dashboard.
 */
const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env['NODE_ENV'] === 'production' ? { rejectUnauthorized: false } : false,
})

export const db = drizzle(pool, { schema })

export type Database = typeof db

/**
 * Sets the PostgreSQL search_path to the tenant's schema for the duration
 * of the provided callback, then resets it to public before releasing the
 * connection back to Supavisor.
 *
 * Supavisor in transaction mode ensures the search_path cannot leak to the
 * next request that reuses the same underlying connection — but we reset it
 * explicitly as a defense-in-depth measure.
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
    await client.query('SET search_path TO public')
    client.release()
  }
}

/**
 * Provisions a new tenant schema.
 * Called during tenant registration. Idempotent — safe to call multiple times.
 * Uses DATABASE_URL (pooler) for schema creation, which is safe in a single
 * transaction. Drizzle Kit migrations run separately via DIRECT_URL.
 */
export async function provisionTenantSchema(tenantId: string): Promise<void> {
  const client = await pool.connect()
  try {
    const schemaName = `merchant_${tenantId}`
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
