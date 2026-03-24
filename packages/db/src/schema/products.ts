import { pgTable, text, timestamp, boolean, integer, numeric, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const productTypeEnum = pgEnum('product_type', ['item', 'modifier', 'combo', 'service'])
export const modifierSelectionEnum = pgEnum('modifier_selection_type', ['single', 'multiple'])

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  /** Self-referential FK for nested category trees */
  parentCategoryId: text('parent_category_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  sku: text('sku'),
  barcode: text('barcode'),
  categoryId: text('category_id').references(() => categories.id),
  productType: productTypeEnum('product_type').notNull().default('item'),
  imageUrl: text('image_url'),
  taxClassId: text('tax_class_id'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const productVariants = pgTable('product_variants', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sku: text('sku'),
  barcode: text('barcode'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  cost: numeric('cost', { precision: 10, scale: 2 }),
  trackInventory: boolean('track_inventory').notNull().default(false),
  weight: numeric('weight', { precision: 10, scale: 3 }),
  dimensions: jsonb('dimensions'),
  /** Allows deactivating a single variant without touching the parent product */
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * Defines component items that make up a COMBO product.
 * Only used when products.product_type = 'combo'.
 */
export const comboItems = pgTable('combo_items', {
  id: text('id').primaryKey(),
  /** FK to products WHERE product_type = 'combo' */
  comboProductId: text('combo_product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  /** FK to the component product included in the combo */
  componentProductId: text('component_product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull().default(1),
  /** NULL = use component's standard price; set to override within the combo */
  priceOverride: numeric('price_override', { precision: 10, scale: 2 }),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const modifierGroups = pgTable('modifier_groups', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  selectionType: modifierSelectionEnum('selection_type').notNull().default('single'),
  minSelections: integer('min_selections').notNull().default(0),
  maxSelections: integer('max_selections'),
  isRequired: boolean('is_required').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const modifiers = pgTable('modifiers', {
  id: text('id').primaryKey(),
  modifierGroupId: text('modifier_group_id')
    .notNull()
    .references(() => modifierGroups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priceDelta: numeric('price_delta', { precision: 10, scale: 2 }).notNull().default('0'),
  costDelta: numeric('cost_delta', { precision: 10, scale: 2 }).notNull().default('0'),
  sku: text('sku'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
})

/** Join table linking products to their available modifier groups */
export const productModifierGroups = pgTable('product_modifier_groups', {
  productId: text('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  modifierGroupId: text('modifier_group_id')
    .notNull()
    .references(() => modifierGroups.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const menuTypeEnum = pgEnum('menu_type', ['dine_in', 'takeout', 'delivery', 'online'])

export const menus = pgTable('menus', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  type: menuTypeEnum('type').notNull().default('dine_in'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const menuItems = pgTable('menu_items', {
  id: text('id').primaryKey(),
  menuId: text('menu_id')
    .notNull()
    .references(() => menus.id, { onDelete: 'cascade' }),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  priceOverride: numeric('price_override', { precision: 10, scale: 2 }),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  availableFrom: text('available_from'),
  availableUntil: text('available_until'),
  availableDays: jsonb('available_days'),
})

export const menuLocations = pgTable('menu_locations', {
  menuId: text('menu_id')
    .notNull()
    .references(() => menus.id, { onDelete: 'cascade' }),
  locationId: text('location_id').notNull(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentCategoryId], references: [categories.id] }),
  children: many(categories),
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
  comboItems: many(comboItems, { relationName: 'comboProduct' }),
  modifierGroups: many(productModifierGroups),
}))

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}))

export const modifierGroupsRelations = relations(modifierGroups, ({ many }) => ({
  modifiers: many(modifiers),
  products: many(productModifierGroups),
}))

export const menusRelations = relations(menus, ({ many }) => ({
  items: many(menuItems),
  locations: many(menuLocations),
}))
