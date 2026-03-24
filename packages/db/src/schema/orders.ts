import { pgTable, text, timestamp, boolean, integer, numeric, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { products, productVariants } from './products.js'
import { customers } from './customers.js'
import { devices } from './devices.js'

export const orderStatusEnum = pgEnum('order_status', [
  'open',
  'in_progress',
  'ready',
  'completed',
  'cancelled',
  'voided',
])

export const orderTypeEnum = pgEnum('order_type', [
  'dine_in',
  'takeout',
  'delivery',
  'online',
  'catering',
])

export const orderSourceEnum = pgEnum('order_source', [
  'pos',
  'online',
  'kiosk',
  'third_party',
  'api',
])

export const tableStatusEnum = pgEnum('table_status', ['available', 'occupied', 'reserved'])

export const tables = pgTable('tables', {
  id: text('id').primaryKey(),
  locationId: text('location_id').notNull(),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(4),
  section: text('section'),
  status: tableStatusEnum('status').notNull().default('available'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  orderNumber: text('order_number').notNull(),
  status: orderStatusEnum('status').notNull().default('open'),
  orderType: orderTypeEnum('order_type').notNull().default('dine_in'),
  source: orderSourceEnum('source').notNull().default('pos'),
  tableId: text('table_id').references(() => tables.id),
  customerId: text('customer_id').references(() => customers.id),
  employeeId: text('employee_id'),
  /** FK → devices.id — the device that created this order */
  deviceId: text('device_id').references(() => devices.id),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull().default('0'),
  discountTotal: numeric('discount_total', { precision: 10, scale: 2 }).notNull().default('0'),
  taxTotal: numeric('tax_total', { precision: 10, scale: 2 }).notNull().default('0'),
  tipAmount: numeric('tip_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
})

export const orderItemStatusEnum = pgEnum('order_item_status', [
  'pending',
  'sent',
  'preparing',
  'ready',
  'served',
  'voided',
])

export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productVariantId: text('product_variant_id')
    .notNull()
    .references(() => productVariants.id),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  /**
   * JSONB snapshot of selected modifiers at time of order.
   * Preserves point-in-time state even if modifiers change later.
   * order_item_modifiers is the queryable relational version.
   */
  modifiersSnapshot: jsonb('modifiers_snapshot').notNull().default('[]'),
  notes: text('notes'),
  status: orderItemStatusEnum('status').notNull().default('pending'),
  sentToKitchenAt: timestamp('sent_to_kitchen_at'),
  preparedAt: timestamp('prepared_at'),
  voidedAt: timestamp('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
})

export const orderItemModifiers = pgTable('order_item_modifiers', {
  id: text('id').primaryKey(),
  orderItemId: text('order_item_id')
    .notNull()
    .references(() => orderItems.id, { onDelete: 'cascade' }),
  modifierId: text('modifier_id').notNull(),
  modifierName: text('modifier_name').notNull(),
  priceDelta: numeric('price_delta', { precision: 10, scale: 2 }).notNull().default('0'),
  quantity: integer('quantity').notNull().default(1),
})

export const orderDiscounts = pgTable('order_discounts', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  discountId: text('discount_id').notNull(),
  discountType: text('discount_type').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  codeUsed: text('code_used'),
})

export const courses = pgTable('courses', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  courseNumber: integer('course_number').notNull(),
  /** Back-office reads this; POS sets it on kitchen fire */
  status: text('status').notNull().default('pending'),
  firedAt: timestamp('fired_at'),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const ordersRelations = relations(orders, ({ one, many }) => ({
  table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  device: one(devices, { fields: [orders.deviceId], references: [devices.id] }),
  items: many(orderItems),
  discounts: many(orderDiscounts),
  courses: many(courses),
}))

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  productVariant: one(productVariants, {
    fields: [orderItems.productVariantId],
    references: [productVariants.id],
  }),
  modifiers: many(orderItemModifiers),
}))
