# OrderStack — Merchant Back Office Administration
## Comprehensive Implementation Plan

---

## Overview

OrderStack is a multi-tenant SaaS **back-office administration application** for merchants, targeting restaurant, retail, and food service businesses. It replicates and extends the back-office capabilities of Square Dashboard and Toast's management portal, covering the full merchant operations lifecycle: menu management, inventory, staff, customers, payments, reporting, and integrations.

The application is built as an **Electron desktop application** backed by a cloud API. Electron is used specifically for the back-office — not for point-of-sale or kitchen operations, which are separate products outside this project's scope.

---

## Why Electron for Back-Office Administration

A browser-based web app cannot reliably accomplish the following. Electron provides all of them:

| Use | Detail |
|---|---|
| **Device identification** | Reads hardware-level identifiers (MAC address, machine UUID, OS serial) to produce a stable, verified device fingerprint — used to register and identify the specific workstation |
| **Device binding** | The back-office license is tied to registered devices; unregistered machines cannot access the application regardless of valid credentials |
| **Location-to-device binding** | The workstation is registered to a specific merchant location at setup time; the app always knows which location it belongs to without the user selecting it |
| **Secure credential storage** | Access tokens and device certificates stored in the OS keychain via `keytar` — not in browser localStorage, which is accessible to any script on the page |
| **Verified audit trail** | Every write operation includes the verified hardware device ID alongside the user session, providing tamper-evident audit logs |
| **Auto-update** | Silent background updates via `electron-updater`; merchants always run the latest version without manual intervention |
| **Native OS integration** | System tray icon, native desktop notifications (low stock, payroll approval needed), launch on startup |
| **Crash reporting** | Electron-level crash dumps via Sentry capture errors in both the main process and renderer |

---

## Tech Stack

### Application Architecture

```
orderstack-app/
├── apps/
│   ├── backoffice/               # Back-office administration — Electron desktop app
│   │   ├── electron/
│   │   │   ├── main/             # Main process: device ID, IPC handlers, auto-update, tray
│   │   │   └── preload/          # Context bridge — secure IPC surface exposed to renderer
│   │   ├── renderer/             # React app: all back-office UI
│   │   └── resources/            # App icons, entitlements, native binaries
│   │
│   ├── api/                      # Cloud API server — Fastify (deployed to cloud)
│   └── worker/                   # Background job workers — BullMQ (deployed to cloud)
│
├── packages/
│   ├── db/                       # Drizzle ORM schema + migrations (cloud PostgreSQL)
│   ├── types/                    # Shared Zod schemas + TypeScript types
│   ├── ui/                       # Shared React component library (shadcn/ui + Radix)
│   ├── ipc/                      # Typed IPC channel definitions (main ↔ renderer)
│   ├── api-client/               # Generated REST API client from OpenAPI spec
│   └── config/                   # Shared ESLint, TypeScript, Tailwind configs
│
├── infra/                        # Terraform, Docker, Kubernetes manifests
├── docs/                         # Project documentation
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

### Electron Main Process

| Concern | Technology |
|---|---|
| Framework | Electron 33 |
| Packager | Electron Forge + `@electron-forge/maker-*` |
| Auto-Update | `electron-updater` (Squirrel on Windows, DMG on macOS) |
| IPC | `ipcMain` / `ipcRenderer` with typed channel contracts via `packages/ipc` |
| Device Fingerprint | `node-machine-id` + MAC address via `@network-interface` + OS UUID |
| Secure Storage | `keytar` — OS keychain (Keychain on macOS, Credential Manager on Windows) |
| Deep Linking | Custom protocol `orderstack://` for OAuth callbacks and magic links |
| Logging | `electron-log` — file-based, auto-rotated, platform-appropriate path |
| Crash Reporting | Sentry Electron SDK (main process + renderer as separate scopes) |
| Auto-Launch | `auto-launch` npm package — optional startup on OS boot |

### Frontend (Renderer Process)

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite |
| Language | TypeScript 5.x |
| UI Components | shadcn/ui + Radix UI primitives |
| Styling | Tailwind CSS 4.x |
| State | Zustand (global client state) + TanStack Query v5 (server state) |
| Forms | React Hook Form + Zod |
| Charts | Recharts + Tremor |
| Real-time | Socket.io client (live dashboard data via cloud API) |
| Routing | React Router v7 (hash-based for Electron) |
| Tables | TanStack Table v8 |

### Backend (Cloud API)

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 LTS |
| Framework | Fastify 5 |
| Language | TypeScript 5.x |
| ORM | Drizzle ORM |
| Queue | BullMQ + Redis |
| WebSockets | Socket.io with Redis adapter |
| Auth | Better Auth (JWT + refresh tokens) |
| Search | Meilisearch |
| Storage | Cloudflare R2 / AWS S3 |
| PDF Generation | `@react-pdf/renderer` (reports, invoices, purchase orders) |

### Databases

| Store | Technology | Purpose |
|---|---|---|
| Cloud DB | PostgreSQL 17 + TimescaleDB | Source of truth — all merchant data |
| Cache | Redis 7 | Sessions, queues, pub/sub, rate limiting |
| Search | Meilisearch | Product, customer, and order search |

---

## IPC Architecture (Main ↔ Renderer)

All IPC channels are typed in `packages/ipc/src/channels.ts`. The renderer never calls Node.js APIs directly — everything goes through the context bridge.

```typescript
export const IPC = {
  // Device identity
  DEVICE_GET_ID:            'device:get-id',          // returns stable hardware fingerprint
  DEVICE_GET_INFO:          'device:get-info',         // returns { id, platform, hostname, registeredAt, locationId }
  DEVICE_REGISTER:          'device:register',         // sends fingerprint to API, stores certificate

  // Secure credential storage (OS keychain)
  KEYCHAIN_SET:             'keychain:set',
  KEYCHAIN_GET:             'keychain:get',
  KEYCHAIN_DELETE:          'keychain:delete',

  // Auth
  AUTH_SET_TOKEN:           'auth:set-token',          // stores JWT in keychain
  AUTH_GET_TOKEN:           'auth:get-token',          // retrieves JWT from keychain
  AUTH_CLEAR:               'auth:clear',              // wipes keychain entries on logout

  // App lifecycle
  APP_VERSION:              'app:version',
  APP_UPDATE_AVAILABLE:     'app:update-available',
  APP_UPDATE_DOWNLOAD:      'app:update-download',
  APP_UPDATE_INSTALL:       'app:update-install',
  APP_OPEN_EXTERNAL:        'app:open-external',       // open URLs in system browser (OAuth flows)

  // Notifications
  NOTIFY_SHOW:              'notify:show',             // trigger native OS notification

  // Deep link
  DEEP_LINK_RECEIVED:       'deep-link:received',      // orderstack:// protocol handler result
} as const
```

### Device Certificate Design

The device certificate is a **signed JWT** (separate from the auth JWT) issued by the API at registration time and stored in the OS keychain. It proves that a specific hardware fingerprint was explicitly authorized by an admin.

**Certificate payload:**
```json
{
  "sub": "<device-uuid>",
  "tid": "<tenant-id>",
  "lid": "<location-id>",
  "fph": "<sha256-of-fingerprint>",  // fingerprint hash — binds cert to this hardware
  "iat": 1700000000,
  "exp": 1731536000                  // 1 year; renewable before expiry
}
```

**Signing:** RS256 (asymmetric). The API holds the private key (stored in Doppler/AWS Secrets Manager). The public key is embedded in the Electron app bundle at build time for offline verification of the cert structure, but the API always re-validates the signature server-side on every request.

**Replay prevention:** The `fph` field (SHA-256 of the hardware fingerprint) is re-computed on every request in the Electron main process and sent as `X-Device-Fingerprint`. The API verifies that `X-Device-Fingerprint` matches the `fph` in the certificate. A stolen certificate used on a different machine will have a mismatched fingerprint and be rejected with `403`.

**Certificate rotation:** 30 days before expiry, the app silently calls `POST /devices/:id/renew` with the current cert + fresh fingerprint. The API issues a new cert with a new `exp`. If a cert expires without renewal (e.g., machine was offline for a year), the user sees a re-registration screen and an admin must approve the device again.

**Fingerprint drift:** `node-machine-id` can reset after an OS reinstall; MAC addresses change on VMs or when switching network adapters. The fingerprint is therefore a composite of multiple signals:
- `node-machine-id` (most stable)
- Primary ethernet MAC (excluded if virtual/loopback)
- OS platform + architecture

If the fingerprint changes on the next launch (drift detected), the app shows a "Device identity changed" screen. The user must log in again and an admin must re-approve the device. The old `devices` record is marked `FINGERPRINT_DRIFTED` (not immediately revoked) so admins can distinguish legitimate hardware changes from suspicious activity.

### Device Registration Flow

```
First launch on a new machine:
1. main/device.ts computes composite fingerprint (node-machine-id + MAC + platform)
2. Renderer shows device registration screen
3. Admin user logs in with email/password + MFA
4. POST /devices/register { fingerprint, locationId, name }
5. API creates devices record, signs and returns device certificate (RS256 JWT)
6. Certificate stored in OS keychain via keytar
7. All subsequent API requests include:
     X-Device-ID: <device-uuid>
     X-Device-Cert: <signed JWT>
     X-Device-Fingerprint: <current SHA-256 fingerprint>
8. API middleware on every request:
   a. Decodes and verifies X-Device-Cert signature (RS256 public key)
   b. Confirms device status = ACTIVE in DB
   c. Confirms X-Device-Fingerprint matches fph claim in cert
   d. Any failure → 403 Forbidden
```

---

## Database Schema

### Multi-Tenancy Strategy

Shared database, separate schema per tenant. Each merchant gets a PostgreSQL schema (e.g., `merchant_abc123`). A public schema holds global tables (tenants, plans, billing). This provides strong data isolation without full database-per-tenant cost.

**Connection pooling requirement:** Setting `SET search_path = merchant_{id}` per request is only safe with **transaction-mode connection pooling** (PgBouncer in transaction mode). Session-mode pooling will leak the `search_path` to the next request that reuses the same connection, exposing one tenant's data to another. PgBouncer must be configured with `pool_mode = transaction` and the API must reset the `search_path` to `public` before releasing the connection back to the pool. This is non-negotiable for production.

**Tenant schema provisioning vs. transactions:** `CREATE SCHEMA` is transactional in PostgreSQL, but Drizzle's `migrate()` opens its own connection and cannot be nested in a caller's transaction. The registration flow uses a two-step strategy:
1. `BEGIN` → insert `tenants` row → `CREATE SCHEMA merchant_{id}` → `COMMIT`
2. Call `provisionTenantSchema(tenantId)` — runs Drizzle migrations against the new schema on a separate connection
3. If step 2 fails, a cleanup job detects orphaned schemas (tenant row exists, schema empty/absent) and retries. `provisionTenantSchema` is idempotent — safe to run multiple times.

### Back-Office Read vs. Write Clarification

Some tables are written by the POS terminal (a separate product) and are **read-only** from the back-office's perspective:

| Table | Back-Office Role |
|---|---|
| `cash_drawers`, `cash_events` | Read-only — created by POS; back-office views and reconciles |
| `courses` | Read-only — fired by POS; back-office views order history |
| `time_entries` (clock-in/out rows) | Read — created by POS clock-in; back-office edits and approves |
| `payments` where `processor = PAYPAL_ZETTLE` | Read-only — Zettle is card-present hardware; back-office never creates these |
| `order_items.sent_to_kitchen_at` | Read-only — set by POS on kitchen fire |

The back-office API never exposes `POST` endpoints for these write paths. Attempting to create them via the back-office API returns `405 Method Not Allowed`.

### Core Schema Groups

#### Tenant / Organization

```sql
tenants
  id, name, slug, plan_id, status, settings (JSONB), created_at

locations
  id, tenant_id, name, address, timezone, currency, tax_config (JSONB),
  is_active, created_at

plans
  id, name, features (JSONB), price_monthly, price_annually

subscriptions
  id, tenant_id, plan_id, status, current_period_start, current_period_end,
  paypal_subscription_id
```

#### Users & Permissions

```sql
users
  id, tenant_id, email, password_hash, first_name, last_name, phone,
  avatar_url, is_active, mfa_enabled, created_at

roles
  id, tenant_id, name, description, is_system_role

permissions
  id, resource, action  -- e.g., resource='orders', action='void'

role_permissions
  role_id, permission_id

user_roles
  user_id, role_id, location_id  -- nullable location_id = all locations

sessions
  id, user_id, token_hash, expires_at, ip_address, user_agent, device_id
```

#### Devices

```sql
-- Registered back-office workstations
devices
  id, tenant_id, location_id, name,
  fingerprint,              -- hardware fingerprint hash
  certificate,              -- signed device certificate (verified on every request)
  platform (MACOS|WINDOWS|LINUX),
  hostname, os_version,
  status (ACTIVE|REVOKED),
  registered_by,            -- user_id of the admin who registered this device
  last_seen_at, registered_at

device_access_log
  id, device_id, user_id, action, ip_address, created_at
```

#### Products & Menu

```sql
categories
  id, tenant_id, name, description, image_url, sort_order, is_active,
  parent_category_id

products
  id, tenant_id, name, description, sku, barcode, category_id,
  product_type (ITEM|MODIFIER|COMBO|SERVICE), image_url,
  tax_class_id, is_active, metadata (JSONB), created_at

product_variants
  id, product_id, name, sku, barcode, price, cost, track_inventory,
  weight, dimensions (JSONB),
  is_active                 -- allows deactivating a single variant without touching the product

-- Component items that make up a COMBO product
combo_items
  id, combo_product_id,       -- FK → products.id WHERE product_type = 'COMBO'
  component_product_id,       -- FK → products.id
  quantity,
  price_override,             -- NULL = use component standard price
  sort_order

modifier_groups
  id, tenant_id, name, selection_type (SINGLE|MULTIPLE),
  min_selections, max_selections, is_required

modifiers
  id, modifier_group_id, name, price_delta, cost_delta, sku, is_active, sort_order

product_modifier_groups
  product_id, modifier_group_id, sort_order

menus
  id, tenant_id, name, description, type (DINE_IN|TAKEOUT|DELIVERY|ONLINE)

menu_items
  id, menu_id, product_id, price_override, is_available, sort_order,
  available_from (time), available_until (time), available_days (JSONB)

menu_locations
  menu_id, location_id
```

#### Inventory

```sql
inventory_items
  id, tenant_id, product_variant_id,
  unit_of_measure (EA|OZ|LB|G|KG|ML|L|FL_OZ|GAL|CS|DZ|PT|QT),  -- enum prevents 'kg' vs 'KG' drift
  reorder_point, reorder_quantity

inventory_levels
  id, inventory_item_id, location_id, quantity_on_hand, quantity_committed,
  quantity_available, updated_at

inventory_adjustments
  id, inventory_item_id, location_id,
  adjustment_type (SALE|RETURN|WASTE|RECEIVE|TRANSFER|COUNT),
  quantity_delta, reference_id, reference_type, notes, created_by, created_at

purchase_orders
  id, tenant_id, location_id, vendor_id, status, expected_delivery_date,
  notes, total_cost, created_by, created_at

purchase_order_items
  id, purchase_order_id, inventory_item_id, quantity_ordered,
  quantity_received, unit_cost

stock_transfers
  id, tenant_id, from_location_id, to_location_id, status,
  initiated_by, completed_at, notes

stock_transfer_items
  id, transfer_id, inventory_item_id, quantity_requested, quantity_transferred
```

#### Orders

```sql
orders
  id, tenant_id, location_id, order_number,
  status (OPEN|IN_PROGRESS|READY|COMPLETED|CANCELLED|VOIDED),
  order_type (DINE_IN|TAKEOUT|DELIVERY|ONLINE|CATERING),
  source (POS|ONLINE|KIOSK|THIRD_PARTY|API),
  table_id, customer_id, employee_id,
  device_id,                -- FK → devices.id (the device that created this order)
  subtotal, discount_total, tax_total, tip_amount, total,
  notes, metadata (JSONB), created_at, updated_at, completed_at

order_items
  id, order_id, product_variant_id, quantity, unit_price, discount_amount,
  tax_amount, total, modifiers (JSONB snapshot), notes, status,
  sent_to_kitchen_at, prepared_at, voided_at, voided_by, void_reason

order_item_modifiers
  id, order_item_id, modifier_id, modifier_name, price_delta, quantity

order_discounts
  id, order_id, discount_id, discount_type, amount, code_used

tables
  id, location_id, name, capacity, section,
  status (AVAILABLE|OCCUPIED|RESERVED)

courses
  id, order_id, course_number, status, fired_at
```

#### Payments

```sql
payments
  id, order_id, tenant_id, location_id,
  payment_method (CASH|CARD|GIFT_CARD|SPLIT|EXTERNAL|ONLINE),
  processor (PAYPAL_ZETTLE|PAYPAL_BRAINTREE),
  amount, tip_amount,
  status (PENDING|AUTHORIZED|CAPTURED|FAILED|REFUNDED),
  processor_transaction_id, processor_response (JSONB),
  card_brand, card_last4, card_exp_month, card_exp_year,
  created_at, captured_at, refunded_at

refunds
  id, payment_id, amount, reason, status, processor_refund_id,
  initiated_by, created_at

splits
  id, order_id, split_type (EVEN|CUSTOM|BY_ITEM), split_count

split_payments
  id, split_id, payment_id, amount

cash_drawers
  id, location_id,
  device_id,                -- FK → devices.id
  opened_by, closed_by,
  opening_float, closing_float, expected_amount,
  actual_amount, discrepancy, opened_at, closed_at

cash_events
  id, cash_drawer_id,
  event_type (OPEN|CLOSE|PAID_IN|PAID_OUT|SALE|REFUND),
  amount, notes, created_by, created_at
```

#### Employees & Scheduling

```sql
-- An employee always exists independently of a user account.
-- Kitchen staff with PIN-only access have no user account (user_id is NULL).
-- Managers and owners have a linked user account.
employees
  id, tenant_id,
  user_id,                  -- FK → users.id; NULLABLE
  employee_number, first_name, last_name,
  email, phone, hire_date, termination_date,
  pay_type (HOURLY|SALARY), pay_rate, overtime_rate,
  location_ids (JSONB), role_id,
  pin_hash,                 -- used for POS clock-in (managed by POS app, stored here)
  is_active

time_entries
  id, employee_id, location_id, clock_in, clock_out, break_minutes,
  regular_hours, overtime_hours, gross_pay,
  status (OPEN|CLOSED|APPROVED), approved_by, notes

schedules
  id, tenant_id, location_id, week_start_date,
  status (DRAFT|PUBLISHED|ARCHIVED),
  published_at, published_by, notes

schedule_shifts
  id, schedule_id, employee_id, role_id, start_time, end_time,
  break_minutes, notes, status (SCHEDULED|ACCEPTED|DECLINED|SWAPPED)

shift_swap_requests
  id, original_shift_id, requesting_employee_id, target_employee_id,
  status, approved_by, created_at

time_off_requests
  id, employee_id, start_date, end_date, reason, status,
  reviewed_by, created_at
```

#### Customers & CRM

```sql
customers
  id, tenant_id, first_name, last_name, email, phone,
  birthday, anniversary, address (JSONB), notes,
  marketing_opt_in, source, created_at

customer_tags
  id, tenant_id, name, color

customer_tag_assignments
  customer_id, tag_id

customer_visits
  id, customer_id, location_id, order_id, visit_date, spend_amount

loyalty_programs
  id, tenant_id, name, type (POINTS|VISITS|SPEND), is_active,
  points_per_dollar, points_redemption_rate, visit_threshold,
  spend_threshold, expiry_days, config (JSONB)

loyalty_accounts
  id, customer_id, program_id, points_balance, lifetime_points,
  visits_count, lifetime_spend, tier_id, enrolled_at,
  last_activity_at          -- used to compute expiry against expiry_days

loyalty_tiers
  id, program_id, name, min_points, min_spend, benefits (JSONB), sort_order

loyalty_transactions
  id, loyalty_account_id,
  transaction_type (EARN|REDEEM|EXPIRE|ADJUST),
  points_delta, reference_order_id, notes, created_at

gift_cards
  id, tenant_id, code, initial_balance, current_balance,
  status (ACTIVE|INACTIVE|EXHAUSTED), purchased_by_customer_id,
  activated_at, expires_at

gift_card_transactions
  id, gift_card_id, order_id,
  transaction_type (LOAD|REDEMPTION|REFUND),
  amount, balance_after, created_at
```

#### Discounts & Promotions

```sql
discounts
  id, tenant_id, name,
  type (PERCENTAGE|FIXED_AMOUNT|BOGO|COMBO|FREE_ITEM),
  value, scope (ORDER|ITEM|CATEGORY),
  requires_code, code, max_uses, uses_count, max_uses_per_customer,
  min_order_amount, applicable_categories (JSONB),
  applicable_products (JSONB), start_date, end_date,
  days_of_week (JSONB), start_time, end_time,
  is_active, created_by, created_at

discount_usage
  id, discount_id, order_id,
  customer_id,              -- NULLABLE — guest orders have no customer_id; per-customer limit enforcement requires non-null
  amount_saved, created_at
```

#### Vendors & Purchasing

```sql
vendors
  id, tenant_id, name, contact_name, email, phone,
  address (JSONB), payment_terms, notes, is_active

vendor_products
  id, vendor_id, inventory_item_id, vendor_sku, unit_cost,
  case_size, lead_time_days, is_preferred
```

#### Financial / Accounting

```sql
tax_classes
  id, tenant_id, name, rate,
  applies_to (FOOD|BEVERAGE|ALCOHOL|ALL),
  is_compound, location_overrides (JSONB)

payment_periods
  id, tenant_id, location_id, period_type (DAILY|WEEKLY),
  start_date, end_date, status,
  net_sales, gross_sales, tax_collected, tips_collected,
  refunds_total, cash_amount, card_amount

general_ledger_exports
  id, tenant_id, export_type (QUICKBOOKS|XERO|SAGE|CSV),
  period_start, period_end,
  status (PENDING|PROCESSING|COMPLETE|FAILED),
  -- Flow: POST /accounting/export → BullMQ job → worker queries payment_periods
  -- + orders → renders journal entries → uploads PDF to R2 → status = COMPLETE
  file_url,                 -- R2 signed URL; NULL until worker completes
  job_id,                   -- BullMQ job ID for polling
  error_message,
  exported_at, exported_by

chart_of_accounts
  id, tenant_id, account_number, account_name,
  account_type (ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE),
  parent_account_id, integration_mapping (JSONB)
```

#### Audit Log

```sql
-- Foundational infrastructure — wired into Fastify onResponse hook from Step 1.
-- Every write operation (POST/PATCH/DELETE) produces one row.
-- Adding this retroactively means backfilling all routes; it must exist from day one.
audit_log
  id, tenant_id, user_id, device_id,
  resource_type,            -- e.g., 'order', 'employee', 'discount'
  resource_id,              -- UUID of the affected record
  action (CREATE|UPDATE|DELETE),
  before (JSONB),           -- snapshot of record before change; NULL on CREATE
  after (JSONB),            -- snapshot of record after change; NULL on DELETE
  ip_address,
  created_at
```

#### House Accounts

```sql
house_accounts
  id, tenant_id, customer_id, name,
  credit_limit,             -- NULL = no limit
  current_balance,          -- amount currently owed (positive = customer owes merchant)
  status (ACTIVE|SUSPENDED|CLOSED),
  created_at

house_account_transactions
  id, house_account_id, order_id,
  transaction_type (CHARGE|PAYMENT|ADJUSTMENT),
  amount, balance_after, notes, created_by, created_at
```

#### Campaigns

```sql
campaigns
  id, tenant_id, name,
  channel (EMAIL|SMS),
  type (ONE_TIME|AUTOMATED),
  trigger (MANUAL|BIRTHDAY|WIN_BACK|POST_VISIT),  -- NULL for ONE_TIME
  subject,                  -- email subject line
  body,                     -- message body (HTML for email, plain text for SMS)
  segment_id,               -- FK → customer_segments.id; NULL = all customers
  status (DRAFT|SCHEDULED|SENDING|SENT|CANCELLED),
  scheduled_at, sent_at, created_by, created_at

customer_segments
  id, tenant_id, name, description,
  type (DYNAMIC|MANUAL),
  rules (JSONB),            -- dynamic segment filter rules
  created_at

campaign_recipients
  id, campaign_id, customer_id,
  status (PENDING|SENT|FAILED|BOUNCED|OPTED_OUT),
  sent_at, opened_at, clicked_at

campaign_stats
  id, campaign_id,
  total_recipients, sent_count, failed_count,
  open_count, click_count, redemption_count,
  updated_at
```

#### Loyalty Blackouts

```sql
loyalty_blackout_items
  id, program_id,
  entity_type (PRODUCT|CATEGORY),
  entity_id,                -- FK → products.id or categories.id
  created_at
```

#### API & Webhooks

```sql
api_keys
  id, tenant_id, name, key_prefix, key_hash, scopes (JSONB),
  last_used_at, expires_at, is_active, created_by, created_at

webhook_endpoints
  id, tenant_id, url, events (JSONB), secret_hash, is_active, created_at

webhook_deliveries
  id, endpoint_id, event_type, payload (JSONB), status,
  http_status,
  response_body VARCHAR(2048),  -- capped at 2KB; unbounded responses bloat the table
  attempt_count, next_retry_at,
  delivered_at, created_at
```

---

## API Design

### Structure

```
Base URL:  https://api.orderstack.io/v1
Auth:      Bearer JWT (15 min access token)
           Refresh token (HTTP-only cookie, 30 days)
           X-API-Key header (for integrations)
           X-Device-ID + X-Device-Cert headers (verified on every request from Electron app)
```

### REST Resource Groups

```
/auth
  POST  /auth/login
  POST  /auth/logout
  POST  /auth/refresh
  POST  /auth/mfa/setup
  POST  /auth/mfa/verify
  POST  /auth/forgot-password
  POST  /auth/reset-password

/devices
  GET   /devices                          -- list registered devices for tenant
  POST  /devices/register                 -- register new device with fingerprint
  GET   /devices/:id
  PATCH /devices/:id                      -- rename device
  DELETE /devices/:id                     -- revoke device access
  GET   /devices/:id/access-log

/tenants
  GET   /tenants/:id
  PATCH /tenants/:id
  GET   /tenants/:id/locations
  POST  /tenants/:id/locations

/locations/:id
  GET   /locations/:id
  PATCH /locations/:id

/products          GET, POST, PATCH, DELETE + /bulk
/products/:id/variants
/categories        GET, POST, PATCH, DELETE
/modifier-groups   GET, POST, PATCH, DELETE
/menus             GET, POST, PATCH, DELETE
/menus/:id/items   GET, POST, PATCH, DELETE
/menus/:id/publish POST

/orders
  GET    /orders
  GET    /orders/:id
  PATCH  /orders/:id/status
  POST   /orders/:id/void

/payments
  GET   /payments
  GET   /payments/:id
  POST  /payments/:id/refund

/inventory
  GET   /inventory
  POST  /inventory/adjustments
  GET   /inventory/adjustments
  POST  /inventory/counts
  PATCH /inventory/counts/:id
  POST  /inventory/transfers

/purchase-orders   GET, POST, PATCH + /:id/receive
/vendors           GET, POST, PATCH, DELETE

/employees         GET, POST, PATCH, DELETE
/employees/:id/pin         PATCH  -- set or reset POS PIN; hashed server-side before storage
/employees/:id/time-entries
/employees/:id/schedule

/schedules         GET, POST, PATCH
/schedules/:id/publish  POST
/schedules/:id/shifts   GET, POST, PATCH

/customers         GET, POST, PATCH, DELETE
/customers/:id/orders
/customers/:id/loyalty
/customers/search

/loyalty/programs  GET, POST, PATCH
/loyalty/accounts/:customerId  GET
/loyalty/accounts/:customerId/adjust  POST

/gift-cards        GET, POST, PATCH
/gift-cards/:code/reload  POST

/discounts         GET, POST, PATCH, DELETE

/reports/sales     GET
/reports/products  GET
/reports/employees GET
/reports/inventory GET
/reports/payments  GET
/reports/export    POST (async, returns job ID)
/reports/export/:jobId  GET

/accounting
  GET   /accounting/chart-of-accounts
  POST  /accounting/chart-of-accounts
  PATCH /accounting/chart-of-accounts/:id
  POST  /accounting/connect/quickbooks
  GET   /accounting/connect/quickbooks/callback
  POST  /accounting/connect/xero
  GET   /accounting/connect/xero/callback
  DELETE /accounting/connect/:provider
  POST  /accounting/export
  GET   /accounting/exports
  GET   /accounting/exports/:id

/webhooks          GET, POST, PATCH, DELETE
/webhooks/:id/deliveries  GET

/api-keys          GET, POST, DELETE
```

### Webhook Event Catalog

```
order.created             order.updated
order.completed           order.cancelled
order.voided              payment.completed
payment.failed            payment.refunded
inventory.low_stock       inventory.out_of_stock
inventory.adjusted        customer.created
customer.updated          loyalty.points_earned
loyalty.points_redeemed   loyalty.tier_changed
employee.clocked_in       employee.clocked_out
gift_card.activated       gift_card.redeemed
menu.published            device.registered
device.revoked
```

---

## Module Breakdown

### Module 1 — Dashboard & Analytics

**Real-Time Dashboard**
- Live sales ticker (WebSocket-driven from cloud API)
- Today's revenue, orders, average order value, covers
- Hourly sales heatmap vs. prior period
- Active orders queue summary
- Staff currently clocked in
- Low stock alerts panel with native OS notification trigger
- Top-selling items today

**Analytics**
- Revenue trends: daily, weekly, monthly, quarterly, YoY
- Sales by category, product, modifier
- Sales by order type (dine-in, takeout, delivery)
- Time-of-day and day-of-week heatmaps
- Discount and comp analysis
- Void and refund rates
- Net vs. gross sales reconciliation
- Labor cost as % of sales
- COGS and gross margin

**Multi-Location**
- Aggregate view with per-location drill-down
- Location comparison tables
- Regional rollups

---

### Module 2 — Menu & Product Management

- Hierarchical categories (unlimited depth)
- Product variants (size, color, etc.) with individual SKU/barcode/price/cost
- Modifier groups: single/multi-select, required/optional, min/max selections
- Nested modifier groups
- Combo product builder (uses `combo_items` table)
- Ingredient mapping (product → inventory items for auto-deduction)
- Bulk CSV import/export
- Product image upload (CDN delivery via R2)
- Nutritional info + allergen flags
- Tax class per product
- Multiple menus (Dine-In, Happy Hour, Delivery, Seasonal)
- Menu availability rules (time/day/location)
- Per-menu price overrides
- Menu publishing workflow (draft → live)

---

### Module 3 — Order Management

- Order queue view filterable by status, type, source, date, location
- Order detail view with full item breakdown and modifier snapshot
- Order editing and void (with permission gate)
- Full audit trail per order
- Return/refund initiation workflow
- Catering order management (future dates, deposits)
- Delivery order status tracking
- Bulk order export (CSV, PDF)

---

### Module 4 — Inventory Management

- Stock levels per location
- Unit of measure conversion (case → individual units)
- Full, partial, and cycle stock counts
- Waste tracking with reason codes
- Auto-deduction on sale via recipe/ingredient mapping
- Low stock alerts → native OS notification + in-app alert
- Auto-86 toggle: mark item unavailable on menu when stock reaches zero
- Vendor directory
- Purchase orders: create, email PDF to vendor, receive, partial receive
- Receiving discrepancy tracking
- Inter-location stock transfers with approval workflow
- Inventory reports: valuation, shrinkage, usage variance

---

### Module 5 — Employee & Staff Management

- Employee profiles: contact info, pay rates, documents
- RBAC: system roles + custom roles with granular permission assignment
- Time entry management: view, edit, approve
- Timesheet approval workflow with audit trail
- Drag-and-drop schedule builder (week view)
- Schedule templates for recurring patterns
- Employee availability submission and management
- Time-off requests with approval workflow
- Shift swap requests with manager approval
- Overtime alerts during schedule building
- Labor cost forecast in schedule builder (projected vs. target)
- Payroll export (Gusto, ADP, Paychex CSV formats)
- Tip pooling and tip-out calculation and reporting

**System Roles:** Owner, Manager, Supervisor, Cashier, Kitchen Staff, Bartender

---

### Module 6 — Customer Management & CRM

- Customer profiles with full visit and order history across all locations
- Lifetime value, visit frequency, average spend
- Dynamic customer segments (frequency, spend, last visit date, loyalty tier, tags)
- Notes and custom tags
- Duplicate customer merge
- Email campaigns (Resend/SendGrid integration)
- SMS campaigns (Twilio integration)
- Automated messages: birthday offers, win-back, post-visit surveys
- Campaign history and performance metrics (open rate, click rate, redemptions)

---

### Module 7 — Loyalty & Rewards

- Points-based programs (configurable earn rate)
- Visit-based programs (reward after N visits)
- Spend-based programs (tier unlocks at spend thresholds)
- Tiered programs (Bronze/Silver/Gold) with tier-specific benefits
- Points expiry: nightly BullMQ worker (`worker/src/jobs/loyalty-expiry.ts`) queries `loyalty_accounts WHERE last_activity_at < now() - interval '{expiry_days} days'`, inserts `loyalty_transactions` rows with `transaction_type = EXPIRE`, zeroes `points_balance`
- Blackout items/categories from earning via `loyalty_blackout_items` table
- Points adjustment (manual admin correction)
- Points liability report
- Enrollment, redemption rate, and tier distribution analytics

---

### Module 8 — Gift Cards & Promotions

**Gift Cards**
- Physical and digital gift cards
- Bulk activation for B2B
- Reload/top-up
- Expiry policy configuration
- Lost/stolen card deactivation and replacement

**Promotions Engine**
- Happy hour: time/day-based price reduction
- BOGO (buy one get one)
- Combo deals: item A + B at fixed price
- Discount codes (single-use, multi-use, per-customer limit)
- Automatic promotions (no code required, applied by rules)
- Stackable vs. non-stackable promotion rules
- Promotion performance reports

---

### Module 9 — Payments & Financial Management

- Payment history across all locations with filters
- Refund initiation and status tracking
- PayPal Braintree settlement reconciliation
- Cash management: drawer session history, paid-in/out log, reconciliation report
- House account management (charge accounts for regular customers)
- Tip reporting per employee
- Tip pooling configuration and distribution reports
- Daily settlement report
- Tax liability report
- Payment method breakdown report
- PayPal payout matching and reconciliation

---

### Module 10 — Reporting & Business Intelligence

**Standard Reports**
- Sales Summary (hour/day/week/month)
- Product Mix (quantity, revenue, % of total sales)
- Category and Modifier Sales
- Labor Report (hours, cost, labor % of sales)
- Time Card Detail
- Cash Management Report
- Void & Refund Report
- Discount & Promotion Report
- Gift Card Activity Report
- Tax Report
- Customer Frequency Report
- Inventory Valuation Report
- Cost of Goods Report

**Custom Report Builder**
- Dimension and metric selection
- Filters, grouping, sorting
- Scheduled email delivery (daily/weekly/monthly)
- Save and share named reports

**Reporting Infrastructure**
- Standard reports run against PostgreSQL read replicas using TimescaleDB continuous aggregates
- Custom report builder runs against a dedicated `{tenant}_analytics` schema populated by a nightly BullMQ job materializing pre-aggregated fact tables:
  - `analytics_sales_daily` — grain: location × day × category × product
  - `analytics_labor_daily` — grain: location × day × employee × role
  - `analytics_inventory_daily` — grain: location × day × inventory_item
- Custom report queries never run against the OLTP tables

**Export Formats:** PDF, CSV, Excel, JSON

---

### Module 11 — Multi-Location Management

- Centralized menu with per-location price and availability overrides
- Menu change approval workflow for franchise groups
- Location groups with regional rollup reporting
- Per-location settings: tax rates, business hours, payment configuration
- Cross-location inventory visibility and transfer management
- Cross-location gift card and loyalty redemption
- Consolidated reporting across all or selected locations
- Franchise management: separate billing per franchisee, parent-level reporting

---

### Module 12 — Online Ordering & Delivery Configuration

- Branded online ordering page configuration (`order.merchantname.com`)
- Menu availability and pricing for online channel
- Delivery zone setup with distance/zip-code rules and fee configuration
- Estimated prep time settings
- DoorDash, Uber Eats, Grubhub integration configuration
- Menu sync to third-party delivery platforms
- Third-party order history and reconciliation reports

---

### Module 13 — Vendor & Supplier Management

- Vendor directory with full contact management
- Preferred vendor per inventory item
- Purchase order creation, approval, and email delivery (PDF)
- Receiving workflow with discrepancy tracking
- Invoice upload and document storage
- Vendor performance metrics (on-time delivery rate, fill rate)

---

### Module 14 — Accounting Integrations

- QuickBooks Online: OAuth2 connection, daily journal entry sync, chart of accounts mapping
- Xero: same capabilities as QuickBooks
- Sage Intacct: API-based sync for enterprise tenants
- CSV export with configurable field mapping for any accounting system
- Chart of accounts mapping UI
- GL export generation via BullMQ worker → PDF/CSV → stored in R2
- Bank reconciliation: PayPal payout matching

---

### Module 15 — Device Management

- Registered device list with status (active/revoked)
- Device registration flow (new workstation setup)
- Device revocation (lost or decommissioned machine)
- Device access log (which user logged in from which device, when)
- Location-to-device assignment management
- Device health: last seen, OS version, app version

---

### Module 16 — API & Developer Platform

- Full REST API (versioned `/v1`)
- OpenAPI 3.1 spec (auto-generated via `@fastify/swagger`)
- API key management: create, scope, rotate, revoke
- Idempotency keys on all mutation endpoints
- Cursor-based pagination
- Webhook endpoint registration with HMAC-SHA256 signature verification
- Webhook delivery log with response inspection
- Retry with exponential backoff (up to 72 hours)
- Developer portal (Scalar API explorer at `/docs`)
- Node.js and Python SDK generation from OpenAPI spec
- API usage dashboard (request counts, error rates, latency per key)

---

## Security Architecture

| Concern | Approach |
|---|---|
| Secrets | AWS Secrets Manager / Doppler; never in code |
| Transport | TLS 1.3 everywhere; HSTS with preload |
| Rate Limiting | Per-API-key and per-IP via Redis sliding window |
| Input Validation | Zod schemas on every API endpoint |
| SQL Injection | Drizzle ORM parameterized queries only |
| Passwords | bcrypt; MFA via TOTP |
| Device Verification | Signed device certificate verified on every request from Electron app |
| Credential Storage | OS keychain via `keytar`; never localStorage |
| Webhook Signatures | HMAC-SHA256 |
| Authentication | JWT (15 min) + refresh token (30 days, HTTP-only cookie) |
| RBAC | Enforced at API middleware; never rely on UI-only hiding |
| PCI DSS | Card data never touches OrderStack servers (PayPal Braintree tokenization) |
| Audit Logging | All write operations logged with user, device ID, timestamp, before/after snapshot |
| MFA | TOTP (Google Authenticator compatible) required for Owner and Manager roles |
| CORS | Strict allowlist; no wildcard in production |

---

## Scalability Considerations

- **Database:** TimescaleDB continuous aggregates for time-series queries; `orders` table partitioned by `created_at` monthly; read replicas for all reporting queries
- **Analytics:** Dedicated `{tenant}_analytics` schema with materialized tables — custom report builder never hits OLTP
- **Caching:** Redis cache for menu data (invalidated on publish); session cache
- **Queues:** All report generation, GL exports, email, SMS, webhook delivery, and accounting sync are async via BullMQ — never blocking an HTTP response
- **WebSockets:** Socket.io with Redis adapter for horizontal API scaling
- **CDN:** Cloudflare for all static assets and product images
- **Stateless API:** All API servers are stateless; scale horizontally via Kubernetes HPA
- **Multi-tenancy:** Schema-per-tenant; large tenants migrated to dedicated database clusters

---

## Build Order

| Step | Focus |
|---|---|
| **1** | Foundation: monorepo, Electron shell, device registration, auth, multi-tenancy, CI/CD |
| **2** | Menu & product management |
| **3** | Order management + reporting foundation |
| **4** | Inventory management |
| **5** | Employee & labor management |
| **6** | Payments & financial reporting |
| **7** | CRM, loyalty & promotions |
| **8** | Full reporting & BI + custom report builder |
| **9** | Online ordering & delivery configuration |
| **10** | Accounting integrations & public API platform |
| **11** | Enterprise multi-location, SSO, audit logs |

---

## Foundation Checklist

Everything here must be complete and working before any feature module begins.

### 1. Monorepo Scaffold
- [ ] `pnpm-workspace.yaml` declaring all `apps/*` and `packages/*`
- [ ] Root `package.json` with workspace scripts
- [ ] `turbo.json` with full task graph: `build`, `dev`, `lint`, `typecheck`, `test` with correct `dependsOn` and `cache` settings
- [ ] Shared `packages/config/`: `tsconfig.base.json`, `eslint.config.js`, `tailwind.config.ts`
- [ ] `.env.example` at root and per-app documenting every required variable
- [ ] Doppler project created; all secrets loaded; no `.env` files committed

### 2. Electron Shell (`apps/backoffice`)
- [ ] Electron Forge scaffold with Vite + TypeScript template
- [ ] `main/index.ts`: creates `BrowserWindow`, loads renderer, registers all IPC handlers
- [ ] `main/device.ts`: computes hardware fingerprint using `node-machine-id` + MAC address + OS platform
- [ ] `main/keychain.ts`: wraps `keytar` for all credential reads/writes
- [ ] `preload/index.ts`: context bridge exposing typed IPC channels — no `nodeIntegration`
- [ ] `packages/ipc/src/channels.ts`: all channel constants typed as `const`
- [ ] App starts, loads renderer, and closes cleanly on macOS and Windows
- [ ] `electron-updater` wired to GitHub Releases update server
- [ ] `electron-log` writing to platform-appropriate directory
- [ ] Sentry initialized in main process and renderer as separate scopes
- [ ] System tray icon with menu (Open, Check for Updates, Quit)
- [ ] App packaged and installable via `pnpm make`

### 3. Device Registration
- [ ] `devices` and `device_access_log` tables migrated
- [ ] `POST /devices/register` — accepts fingerprint, issues signed certificate, stores in DB
- [ ] API middleware: `X-Device-ID` + `X-Device-Cert` headers verified on every request from Electron app; unregistered devices receive `403`
- [ ] First-launch flow in renderer: detects no certificate in keychain → shows device registration screen → submits fingerprint → stores certificate via `KEYCHAIN_SET` IPC

### 4. Renderer App
- [ ] React 19 + Vite + TypeScript scaffold inside `apps/backoffice/renderer`
- [ ] React Router v7 with hash-based routing
- [ ] Tailwind CSS 4.x configured
- [ ] shadcn/ui initialized with base components
- [ ] Zustand store: auth slice, device slice, active-location slice
- [ ] TanStack Query v5 `QueryClient` configured
- [ ] Authenticated layout shell: sidebar navigation, header, outlet

### 5. Cloud API (`apps/api`)
- [ ] Fastify 5 + TypeScript scaffold
- [ ] `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit` registered
- [ ] Zod request validation on every route
- [ ] Global error handler returning consistent `{ error, code, statusCode }` shape
- [ ] `GET /health` returns `{ status: 'ok', version, timestamp }`
- [ ] OpenAPI 3.1 spec generated at `GET /docs`

### 6. Authentication

> **Better Auth + custom schema integration note:** Better Auth by default manages its own `user`, `session`, `account`, and `verification` tables. This plan uses custom `users`, `sessions`, `roles`, and `user_roles` tables in the tenant schema. Better Auth must be configured with a fully custom database adapter that points to these tables — this is supported but is not the default setup. Spike this integration in isolation before wiring it into the full foundation to confirm the adapter surface covers all required operations (create user, find by email, create session, validate session, invalidate session).

- [ ] Better Auth configured with custom database adapter pointing to the plan's `users` and `sessions` tables
- [ ] `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_roles` migrated
- [ ] `POST /auth/register` — creates tenant + first owner user atomically, provisions tenant schema
- [ ] `POST /auth/login` → JWT access token + refresh cookie
- [ ] `POST /auth/refresh`, `POST /auth/logout`
- [ ] Password reset via email (Resend)
- [ ] TOTP MFA setup and verification
- [ ] `authenticate` Fastify plugin on all protected routes
- [ ] `requirePermission(resource, action)` plugin

### 7. Multi-Tenancy
- [ ] `tenants`, `locations`, `plans`, `subscriptions` tables migrated in public schema
- [ ] `tenant_id` resolved from JWT claim on every request
- [ ] Fastify `onRequest` hook sets PostgreSQL `search_path` to `merchant_{tenant_id}`
- [ ] `provisionTenantSchema()`: called on registration, creates schema, runs all migrations against it
- [ ] End-to-end: register → schema provisioned → owner created → JWT returned → device registered

### 8. Database (`packages/db`)
- [ ] Drizzle ORM configured for PostgreSQL with `drizzle-kit`
- [ ] All schema files written (every table defined in this document)
- [ ] `audit_log` table migrated and Fastify `onResponse` hook wired to write one row per mutating request — this must exist from day one; adding it retroactively means backfilling every route
- [ ] PgBouncer configured in transaction mode (`pool_mode = transaction`); API resets `search_path` to `public` before releasing each connection
- [ ] Migrations generated and applied to both public schema and a test tenant schema
- [ ] Seed script: demo tenant, location, owner user, sample products and menu

### 9. CI/CD (GitHub Actions)
- [ ] `lint.yml`: ESLint + Prettier on every PR
- [ ] `typecheck.yml`: `tsc --noEmit` across all packages on every PR
- [ ] `test.yml`: Vitest on every PR
- [ ] `deploy-api.yml`: deploys `apps/api` to staging on merge to `main`
- [ ] `codegen.yml`: on merge to `main`, fetches OpenAPI spec from the deployed staging API at `/docs/json`, runs `openapi-typescript-codegen` to regenerate `packages/api-client/src`, commits the result — ensures the client is always in sync with the live spec
- [ ] `release.yml`: builds Electron distributables for macOS + Windows on version tag; uploads to GitHub Releases

### 10. Observability
- [ ] Sentry configured for `apps/api` and `apps/backoffice` (separate DSNs)
- [ ] Pino logs shipped to Grafana Loki in staging/production
- [ ] `GET /metrics` Prometheus-compatible metrics endpoint
- [ ] PostHog initialized in renderer for product analytics

---

## Key Integrations

| Category | Integration | Step |
|---|---|---|
| Payments | PayPal Braintree (card-not-present / online) | 6 |
| Delivery | DoorDash, Uber Eats, Grubhub (config + order sync) | 9 |
| Accounting | QuickBooks Online | 10 |
| Accounting | Xero | 10 |
| Accounting | Sage Intacct | Future |
| Email | Resend / SendGrid | 7 |
| SMS | Twilio | 7 |
| Payroll | Gusto, ADP, Paychex (CSV export) | 5 |
| Search | Meilisearch | 2 |
| Storage | Cloudflare R2 | 1 |
| Auth | Better Auth | 1 |
| Device ID | `node-machine-id` + `keytar` | 1 |
| Monitoring | Sentry + Grafana + Loki | 1 |
| Product Analytics | PostHog | 1 |
| Identity (Enterprise) | SAML 2.0 / OIDC SSO | 11 |
