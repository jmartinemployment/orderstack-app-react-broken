import { pgTable, text, timestamp, numeric, integer, jsonb, pgEnum, varchar } from 'drizzle-orm/pg-core'

export const taxAppliesToEnum = pgEnum('tax_applies_to', ['food', 'beverage', 'alcohol', 'all'])

export const discountTypeEnum = pgEnum('discount_type', [
  'percentage',
  'fixed_amount',
  'bogo',
  'combo',
  'free_item',
])

export const discountScopeEnum = pgEnum('discount_scope', ['order', 'item', 'category'])

export const taxClasses = pgTable('tax_classes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  rate: numeric('rate', { precision: 6, scale: 4 }).notNull(),
  appliesTo: taxAppliesToEnum('applies_to').notNull().default('all'),
  isCompound: numeric('is_compound').notNull().default('0'),
  locationOverrides: jsonb('location_overrides').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const paymentPeriodTypeEnum = pgEnum('payment_period_type', ['daily', 'weekly'])
export const paymentPeriodStatusEnum = pgEnum('payment_period_status', [
  'open',
  'closed',
  'reconciled',
])

export const paymentPeriods = pgTable('payment_periods', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  periodType: paymentPeriodTypeEnum('period_type').notNull().default('daily'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: paymentPeriodStatusEnum('status').notNull().default('open'),
  netSales: numeric('net_sales', { precision: 12, scale: 2 }).notNull().default('0'),
  grossSales: numeric('gross_sales', { precision: 12, scale: 2 }).notNull().default('0'),
  taxCollected: numeric('tax_collected', { precision: 12, scale: 2 }).notNull().default('0'),
  tipsCollected: numeric('tips_collected', { precision: 12, scale: 2 }).notNull().default('0'),
  refundsTotal: numeric('refunds_total', { precision: 12, scale: 2 }).notNull().default('0'),
  cashAmount: numeric('cash_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  cardAmount: numeric('card_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const glExportTypeEnum = pgEnum('gl_export_type', ['quickbooks', 'xero', 'sage', 'csv'])
export const glExportStatusEnum = pgEnum('gl_export_status', [
  'pending',
  'processing',
  'complete',
  'failed',
])

export const generalLedgerExports = pgTable('general_ledger_exports', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  exportType: glExportTypeEnum('export_type').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  status: glExportStatusEnum('status').notNull().default('pending'),
  /**
   * R2/S3 signed URL — NULL until BullMQ worker completes export job.
   * Flow: POST /accounting/export → BullMQ job created →
   * worker queries payment_periods + orders → renders journal entries →
   * uploads to R2 → sets file_url + status = 'complete'
   */
  fileUrl: text('file_url'),
  /** BullMQ job ID for status polling */
  jobId: text('job_id'),
  errorMessage: text('error_message'),
  exportedAt: timestamp('exported_at'),
  exportedBy: text('exported_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
])

export const chartOfAccounts = pgTable('chart_of_accounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  accountNumber: text('account_number').notNull(),
  accountName: text('account_name').notNull(),
  accountType: accountTypeEnum('account_type').notNull(),
  parentAccountId: text('parent_account_id'),
  /** Maps this account to external accounting system codes */
  integrationMapping: jsonb('integration_mapping').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const discounts = pgTable('discounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  type: discountTypeEnum('type').notNull(),
  value: numeric('value', { precision: 10, scale: 4 }).notNull(),
  scope: discountScopeEnum('scope').notNull().default('order'),
  requiresCode: numeric('requires_code').notNull().default('0'),
  code: text('code'),
  maxUses: integer('max_uses'),
  usesCount: integer('uses_count').notNull().default(0),
  maxUsesPerCustomer: integer('max_uses_per_customer'),
  minOrderAmount: numeric('min_order_amount', { precision: 10, scale: 2 }),
  applicableCategories: jsonb('applicable_categories').notNull().default('[]'),
  applicableProducts: jsonb('applicable_products').notNull().default('[]'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  daysOfWeek: jsonb('days_of_week'),
  startTime: text('start_time'),
  endTime: text('end_time'),
  isActive: numeric('is_active').notNull().default('1'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const discountUsage = pgTable('discount_usage', {
  id: text('id').primaryKey(),
  discountId: text('discount_id')
    .notNull()
    .references(() => discounts.id),
  orderId: text('order_id').notNull(),
  /**
   * NULLABLE — guest orders have no customer_id.
   * Per-customer limit enforcement requires non-null customer_id.
   */
  customerId: text('customer_id'),
  amountSaved: numeric('amount_saved', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
