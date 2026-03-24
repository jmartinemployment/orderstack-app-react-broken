import { pgTable, text, timestamp, numeric, integer, jsonb, pgEnum, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { orders } from './orders.js'
import { devices } from './devices.js'

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'card',
  'gift_card',
  'split',
  'external',
  'online',
  'house_account',
  'loyalty_points',
])

export const paymentProcessorEnum = pgEnum('payment_processor', [
  'paypal_zettle',
  'paypal_braintree',
  'cash',
])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
  'cancelled',
])

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  processor: paymentProcessorEnum('processor'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  tipAmount: numeric('tip_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  processorTransactionId: text('processor_transaction_id'),
  processorResponse: jsonb('processor_response'),
  cardBrand: text('card_brand'),
  cardLast4: text('card_last4'),
  cardExpMonth: integer('card_exp_month'),
  cardExpYear: integer('card_exp_year'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  capturedAt: timestamp('captured_at'),
  refundedAt: timestamp('refunded_at'),
})

export const refundStatusEnum = pgEnum('refund_status', [
  'pending',
  'succeeded',
  'failed',
  'cancelled',
])

export const refunds = pgTable('refunds', {
  id: text('id').primaryKey(),
  paymentId: text('payment_id')
    .notNull()
    .references(() => payments.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason'),
  status: refundStatusEnum('status').notNull().default('pending'),
  processorRefundId: text('processor_refund_id'),
  initiatedBy: text('initiated_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const splitTypeEnum = pgEnum('split_type', ['even', 'custom', 'by_item'])

export const splits = pgTable('splits', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  splitType: splitTypeEnum('split_type').notNull(),
  splitCount: integer('split_count').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const splitPayments = pgTable('split_payments', {
  id: text('id').primaryKey(),
  splitId: text('split_id')
    .notNull()
    .references(() => splits.id, { onDelete: 'cascade' }),
  paymentId: text('payment_id')
    .notNull()
    .references(() => payments.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
})

export const cashDrawers = pgTable('cash_drawers', {
  id: text('id').primaryKey(),
  locationId: text('location_id').notNull(),
  /** FK → devices.id (the POS terminal this drawer is attached to) */
  deviceId: text('device_id').references(() => devices.id),
  openedBy: text('opened_by').notNull(),
  closedBy: text('closed_by'),
  openingFloat: numeric('opening_float', { precision: 10, scale: 2 }).notNull().default('0'),
  closingFloat: numeric('closing_float', { precision: 10, scale: 2 }),
  expectedAmount: numeric('expected_amount', { precision: 10, scale: 2 }),
  actualAmount: numeric('actual_amount', { precision: 10, scale: 2 }),
  discrepancy: numeric('discrepancy', { precision: 10, scale: 2 }),
  openedAt: timestamp('opened_at').notNull().defaultNow(),
  closedAt: timestamp('closed_at'),
})

export const cashEventTypeEnum = pgEnum('cash_event_type', [
  'open',
  'close',
  'paid_in',
  'paid_out',
  'sale',
  'refund',
])

export const cashEvents = pgTable('cash_events', {
  id: text('id').primaryKey(),
  cashDrawerId: text('cash_drawer_id')
    .notNull()
    .references(() => cashDrawers.id, { onDelete: 'cascade' }),
  eventType: cashEventTypeEnum('event_type').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  refunds: many(refunds),
}))

export const cashDrawersRelations = relations(cashDrawers, ({ one, many }) => ({
  device: one(devices, { fields: [cashDrawers.deviceId], references: [devices.id] }),
  events: many(cashEvents),
}))
