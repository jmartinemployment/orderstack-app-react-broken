import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // DIRECT_URL bypasses Supavisor and connects directly to the Supabase
    // PostgreSQL instance. Required for migrations — the pooler cannot run DDL
    // reliably in transaction mode.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'] ?? '',
  },
  verbose: true,
  strict: true,
})
