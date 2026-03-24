import { pgTable, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'

export const auditActionEnum = pgEnum('audit_action', ['create', 'update', 'delete'])

/**
 * Foundational write audit trail.
 *
 * Every POST, PATCH, and DELETE request produces one row via the Fastify
 * onResponse hook in apps/api/src/plugins/audit.ts.
 *
 * This table must exist from day one. Adding it retroactively means
 * backfilling every route handler.
 *
 * Lives in each tenant's schema (merchant_{id}).
 */
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** The user who performed the action */
  userId: text('user_id').notNull(),
  /** The registered device the request came from */
  deviceId: text('device_id'),
  /** e.g., 'order', 'employee', 'discount', 'product' */
  resourceType: text('resource_type').notNull(),
  /** UUID of the affected record */
  resourceId: text('resource_id').notNull(),
  action: auditActionEnum('action').notNull(),
  /** Snapshot of the record BEFORE the change; NULL on create */
  before: jsonb('before'),
  /** Snapshot of the record AFTER the change; NULL on delete */
  after: jsonb('after'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
