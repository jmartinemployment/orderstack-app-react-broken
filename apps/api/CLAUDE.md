# @orderstack/api

Fastify 5 cloud API server — the backend for all OrderStack back-office operations.

## Purpose

Handles all REST API requests from the Electron back-office app and any external integrations. Enforces authentication, device verification, multi-tenancy, RBAC, and audit logging on every request.

## Key Files

- `src/main.ts` — entry point, starts Fastify
- `src/app.ts` — registers all plugins and routes
- `src/config/env.ts` — Zod-validated environment variables; app exits if any are missing
- `src/plugins/auth.ts` — Better Auth integration, `request.authenticate()`, `requirePermission()`
- `src/plugins/multitenancy.ts` — sets `search_path` per tenant on every request
- `src/plugins/device.ts` — verifies X-Device-ID + X-Device-Cert + X-Device-Fingerprint
- `src/plugins/audit.ts` — writes audit_log row on every mutating request (POST/PATCH/DELETE)
- `src/routes/` — one file per resource group

## Multi-Tenancy

Every authenticated route uses `withTenantSchema(tenantId, fn)` from `@orderstack/db`.
The multitenancy plugin sets `search_path` automatically — route handlers do not set it manually.

## Audit Logging

Route handlers attach `request.auditBefore` and `request.auditAfter` for the audit plugin.
The audit plugin reads these on `onResponse` and writes to `audit_log`.
Never write to `audit_log` directly from route handlers.

## Error Format

All errors return: `{ error: string, code: string, statusCode: number }`

## Running

```bash
pnpm dev          # tsx watch (hot reload)
pnpm build        # compile to dist/
pnpm start        # run compiled dist/main.js
pnpm typecheck    # tsc --noEmit
```

## Dependencies

- `@orderstack/db` — Drizzle schema and client
- `@orderstack/types` — shared Zod schemas
- `better-auth` — authentication
- `bullmq` — queue jobs (report export, GL export, webhook delivery)
- `fastify` + plugins
