# @orderstack/db

Drizzle ORM schema definitions and database client for the cloud PostgreSQL database.

## Purpose

Single source of truth for all table definitions. Every table in the plan exists as a Drizzle schema file here. The client handles tenant schema isolation via `withTenantSchema()`.

## Key Files

- `src/client.ts` — database pool, `withTenantSchema()`, `provisionTenantSchema()`
- `src/schema/` — one file per domain (tenants, users, devices, products, inventory, orders, payments, employees, customers, financial, audit, webhooks)
- `src/schema/index.ts` — re-exports all tables
- `drizzle.config.ts` — Drizzle Kit configuration

## Multi-Tenancy

- Public schema: `tenants`, `plans`, `subscriptions`, `ba_user`, `ba_session`, `ba_account`, `ba_verification`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`
- Tenant schema (`merchant_{id}`): all other tables
- Always use `withTenantSchema(tenantId, fn)` for tenant-scoped queries
- PgBouncer must run in **transaction mode** — session mode leaks `search_path`

## Connection Pooling Warning

Never point DATABASE_URL directly at PostgreSQL in production. Always use PGBOUNCER_URL (PgBouncer in transaction mode). The `client.ts` connection string prefers PGBOUNCER_URL.

## Migrations

```bash
pnpm db:generate   # generate migration files from schema changes
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # open Drizzle Studio
```

## Dependencies

- `drizzle-orm` — ORM
- `pg` — PostgreSQL driver
- `drizzle-kit` — migration tooling (dev only)
