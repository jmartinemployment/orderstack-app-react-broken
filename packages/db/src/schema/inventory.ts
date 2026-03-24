import { pgTable, text, timestamp, integer, numeric, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { productVariants } from './products.js'

export const unitOfMeasureEnum = pgEnum('unit_of_measure', [
  'ea',  // Each
  'oz',  // Ounce
  'lb',  // Pound
  'g',   // Gram
  'kg',  // Kilogram
  'ml',  // Milliliter
  'l',   // Liter
  'fl_oz', // Fluid ounce
  'gal', // Gallon
  'cs',  // Case
  'dz',  // Dozen
  'pt',  // Pint
  'qt',  // Quart
])

export const adjustmentTypeEnum = pgEnum('inventory_adjustment_type', [
  'sale',
  'return',
  'waste',
  'receive',
  'transfer',
  'count',
  'manual',
])

export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', [
  'draft',
  'sent',
  'partially_received',
  'received',
  'cancelled',
])

export const transferStatusEnum = pgEnum('stock_transfer_status', [
  'pending',
  'in_transit',
  'completed',
  'cancelled',
])

export const inventoryItems = pgTable('inventory_items', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  productVariantId: text('product_variant_id')
    .notNull()
    .references(() => productVariants.id),
  unitOfMeasure: unitOfMeasureEnum('unit_of_measure').notNull().default('ea'),
  reorderPoint: numeric('reorder_point', { precision: 10, scale: 3 }),
  reorderQuantity: numeric('reorder_quantity', { precision: 10, scale: 3 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const inventoryLevels = pgTable('inventory_levels', {
  id: text('id').primaryKey(),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id, { onDelete: 'cascade' }),
  locationId: text('location_id').notNull(),
  quantityOnHand: numeric('quantity_on_hand', { precision: 10, scale: 3 }).notNull().default('0'),
  quantityCommitted: numeric('quantity_committed', { precision: 10, scale: 3 }).notNull().default('0'),
  quantityAvailable: numeric('quantity_available', { precision: 10, scale: 3 }).notNull().default('0'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const inventoryAdjustments = pgTable('inventory_adjustments', {
  id: text('id').primaryKey(),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  locationId: text('location_id').notNull(),
  adjustmentType: adjustmentTypeEnum('adjustment_type').notNull(),
  quantityDelta: numeric('quantity_delta', { precision: 10, scale: 3 }).notNull(),
  /** Reference to the source entity (order_id, purchase_order_id, transfer_id, etc.) */
  referenceId: text('reference_id'),
  referenceType: text('reference_type'),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const vendors = pgTable('vendors', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  paymentTerms: text('payment_terms'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

import { boolean } from 'drizzle-orm/pg-core'

export const vendorProducts = pgTable('vendor_products', {
  id: text('id').primaryKey(),
  vendorId: text('vendor_id')
    .notNull()
    .references(() => vendors.id, { onDelete: 'cascade' }),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  vendorSku: text('vendor_sku'),
  unitCost: numeric('unit_cost', { precision: 10, scale: 2 }).notNull(),
  caseSize: numeric('case_size', { precision: 10, scale: 3 }),
  leadTimeDays: integer('lead_time_days'),
  isPreferred: boolean('is_preferred').notNull().default(false),
})

export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  vendorId: text('vendor_id')
    .notNull()
    .references(() => vendors.id),
  status: purchaseOrderStatusEnum('status').notNull().default('draft'),
  expectedDeliveryDate: timestamp('expected_delivery_date'),
  notes: text('notes'),
  totalCost: numeric('total_cost', { precision: 10, scale: 2 }).notNull().default('0'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  quantityOrdered: numeric('quantity_ordered', { precision: 10, scale: 3 }).notNull(),
  quantityReceived: numeric('quantity_received', { precision: 10, scale: 3 }).notNull().default('0'),
  unitCost: numeric('unit_cost', { precision: 10, scale: 2 }).notNull(),
})

export const stockTransfers = pgTable('stock_transfers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  fromLocationId: text('from_location_id').notNull(),
  toLocationId: text('to_location_id').notNull(),
  status: transferStatusEnum('status').notNull().default('pending'),
  initiatedBy: text('initiated_by').notNull(),
  notes: text('notes'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const stockTransferItems = pgTable('stock_transfer_items', {
  id: text('id').primaryKey(),
  transferId: text('transfer_id')
    .notNull()
    .references(() => stockTransfers.id, { onDelete: 'cascade' }),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  quantityRequested: numeric('quantity_requested', { precision: 10, scale: 3 }).notNull(),
  quantityTransferred: numeric('quantity_transferred', { precision: 10, scale: 3 }).notNull().default('0'),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  productVariant: one(productVariants, {
    fields: [inventoryItems.productVariantId],
    references: [productVariants.id],
  }),
  levels: many(inventoryLevels),
  adjustments: many(inventoryAdjustments),
}))

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  vendor: one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
  items: many(purchaseOrderItems),
}))

export const stockTransfersRelations = relations(stockTransfers, ({ many }) => ({
  items: many(stockTransferItems),
}))
