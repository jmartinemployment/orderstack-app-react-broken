import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
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
 * Executes fn within a Drizzle transaction scoped to the tenant's schema.
 *
 * Uses SET LOCAL so the search_path is automatically scoped to the current
 * transaction and reverts when the transaction ends — no manual reset needed.
 * This eliminates the PoolClient typing conflict while remaining correct with
 * Supavisor in transaction mode.
 */
export async function withTenantSchema<T>(
  tenantId: string,
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL search_path TO "merchant_${tenantId}", public`))
    return fn(tx as unknown as Database)
  })
}

/**
 * Provisions a new tenant schema.
 * Called during tenant registration. Idempotent — safe to call multiple times.
 */
export async function provisionTenantSchema(tenantId: string): Promise<void> {
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "merchant_${tenantId}"`))
}
