import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

export const devicePlatformEnum = pgEnum('device_platform', ['macos', 'windows', 'linux'])
export const deviceStatusEnum = pgEnum('device_status', [
  'active',
  'revoked',
  'fingerprint_drifted',
])

/**
 * Registered back-office workstations.
 * Lives in the tenant schema (merchant_{id}).
 *
 * Every API request from the Electron app must include:
 *   X-Device-ID: devices.id
 *   X-Device-Cert: signed RS256 JWT (see plan: Device Certificate Design)
 *   X-Device-Fingerprint: current SHA-256 fingerprint hash
 *
 * The API middleware verifies all three on every request.
 */
export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  name: text('name').notNull(),
  /** SHA-256 hash of the composite hardware fingerprint */
  fingerprint: text('fingerprint').notNull(),
  /**
   * Signed RS256 JWT device certificate.
   * Payload: { sub, tid, lid, fph, iat, exp }
   * See plan: Device Certificate Design for full spec.
   */
  certificate: text('certificate').notNull(),
  platform: devicePlatformEnum('platform').notNull(),
  hostname: text('hostname').notNull(),
  osVersion: text('os_version'),
  appVersion: text('app_version'),
  status: deviceStatusEnum('status').notNull().default('active'),
  /** User who registered this device */
  registeredBy: text('registered_by').references(() => users.id),
  lastSeenAt: timestamp('last_seen_at'),
  registeredAt: timestamp('registered_at').notNull().defaultNow(),
})

export const deviceAccessLog = pgTable('device_access_log', {
  id: text('id').primaryKey(),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  /** Description of what happened: 'login', 'logout', 'cert_renewed', 'fingerprint_drift' */
  action: text('action').notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const devicesRelations = relations(devices, ({ one, many }) => ({
  registeredByUser: one(users, { fields: [devices.registeredBy], references: [users.id] }),
  accessLog: many(deviceAccessLog),
}))

export const deviceAccessLogRelations = relations(deviceAccessLog, ({ one }) => ({
  device: one(devices, { fields: [deviceAccessLog.deviceId], references: [devices.id] }),
  user: one(users, { fields: [deviceAccessLog.userId], references: [users.id] }),
}))
