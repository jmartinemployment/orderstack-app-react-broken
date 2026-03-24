import { pgTable, text, timestamp, boolean, numeric, jsonb, pgEnum, integer, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  birthday: text('birthday'),
  anniversary: text('anniversary'),
  address: jsonb('address'),
  notes: text('notes'),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  source: text('source'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const customerTags = pgTable('customer_tags', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
})

export const customerTagAssignments = pgTable('customer_tag_assignments', {
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  tagId: text('tag_id')
    .notNull()
    .references(() => customerTags.id, { onDelete: 'cascade' }),
})

export const customerVisits = pgTable('customer_visits', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  locationId: text('location_id').notNull(),
  orderId: text('order_id').notNull(),
  visitDate: timestamp('visit_date').notNull(),
  spendAmount: numeric('spend_amount', { precision: 10, scale: 2 }).notNull().default('0'),
})

export const customerSegments = pgTable('customer_segments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull().default('dynamic'),
  /** JSON filter rules for dynamic segments */
  rules: jsonb('rules').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export const loyaltyProgramTypeEnum = pgEnum('loyalty_program_type', ['points', 'visits', 'spend'])

export const loyaltyPrograms = pgTable('loyalty_programs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  type: loyaltyProgramTypeEnum('type').notNull().default('points'),
  isActive: boolean('is_active').notNull().default(true),
  pointsPerDollar: numeric('points_per_dollar', { precision: 10, scale: 4 }).notNull().default('1'),
  pointsRedemptionRate: numeric('points_redemption_rate', { precision: 10, scale: 4 }).notNull().default('0.01'),
  visitThreshold: integer('visit_threshold'),
  spendThreshold: numeric('spend_threshold', { precision: 10, scale: 2 }),
  expiryDays: integer('expiry_days'),
  config: jsonb('config').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const loyaltyTiers = pgTable('loyalty_tiers', {
  id: text('id').primaryKey(),
  programId: text('program_id')
    .notNull()
    .references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  minPoints: numeric('min_points', { precision: 10, scale: 2 }),
  minSpend: numeric('min_spend', { precision: 10, scale: 2 }),
  benefits: jsonb('benefits').notNull().default('{}'),
  sortOrder: integer('sort_order').notNull().default(0),
})

export const loyaltyAccounts = pgTable('loyalty_accounts', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  programId: text('program_id')
    .notNull()
    .references(() => loyaltyPrograms.id),
  pointsBalance: numeric('points_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  lifetimePoints: numeric('lifetime_points', { precision: 12, scale: 2 }).notNull().default('0'),
  visitsCount: integer('visits_count').notNull().default(0),
  lifetimeSpend: numeric('lifetime_spend', { precision: 12, scale: 2 }).notNull().default('0'),
  tierId: text('tier_id').references(() => loyaltyTiers.id),
  enrolledAt: timestamp('enrolled_at').notNull().defaultNow(),
  /** Used to compute expiry: if now() - lastActivityAt > expiryDays → expire points */
  lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
})

export const loyaltyTransactionTypeEnum = pgEnum('loyalty_transaction_type', [
  'earn',
  'redeem',
  'expire',
  'adjust',
])

export const loyaltyTransactions = pgTable('loyalty_transactions', {
  id: text('id').primaryKey(),
  loyaltyAccountId: text('loyalty_account_id')
    .notNull()
    .references(() => loyaltyAccounts.id, { onDelete: 'cascade' }),
  transactionType: loyaltyTransactionTypeEnum('transaction_type').notNull(),
  pointsDelta: numeric('points_delta', { precision: 12, scale: 2 }).notNull(),
  referenceOrderId: text('reference_order_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const loyaltyBlackoutItems = pgTable('loyalty_blackout_items', {
  id: text('id').primaryKey(),
  programId: text('program_id')
    .notNull()
    .references(() => loyaltyPrograms.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── Gift Cards ───────────────────────────────────────────────────────────────

export const giftCardStatusEnum = pgEnum('gift_card_status', ['active', 'inactive', 'exhausted'])

export const giftCards = pgTable('gift_cards', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  code: text('code').notNull().unique(),
  initialBalance: numeric('initial_balance', { precision: 10, scale: 2 }).notNull(),
  currentBalance: numeric('current_balance', { precision: 10, scale: 2 }).notNull(),
  status: giftCardStatusEnum('status').notNull().default('active'),
  purchasedByCustomerId: text('purchased_by_customer_id').references(() => customers.id),
  activatedAt: timestamp('activated_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const giftCardTransactionTypeEnum = pgEnum('gift_card_transaction_type', [
  'load',
  'redemption',
  'refund',
])

export const giftCardTransactions = pgTable('gift_card_transactions', {
  id: text('id').primaryKey(),
  giftCardId: text('gift_card_id')
    .notNull()
    .references(() => giftCards.id, { onDelete: 'cascade' }),
  orderId: text('order_id'),
  transactionType: giftCardTransactionTypeEnum('transaction_type').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── House Accounts ───────────────────────────────────────────────────────────

export const houseAccountStatusEnum = pgEnum('house_account_status', [
  'active',
  'suspended',
  'closed',
])

export const houseAccounts = pgTable('house_accounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  name: text('name').notNull(),
  /** NULL = no credit limit */
  creditLimit: numeric('credit_limit', { precision: 10, scale: 2 }),
  /** Positive = customer owes merchant */
  currentBalance: numeric('current_balance', { precision: 10, scale: 2 }).notNull().default('0'),
  status: houseAccountStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const houseAccountTransactionTypeEnum = pgEnum('house_account_transaction_type', [
  'charge',
  'payment',
  'adjustment',
])

export const houseAccountTransactions = pgTable('house_account_transactions', {
  id: text('id').primaryKey(),
  houseAccountId: text('house_account_id')
    .notNull()
    .references(() => houseAccounts.id, { onDelete: 'cascade' }),
  orderId: text('order_id'),
  transactionType: houseAccountTransactionTypeEnum('transaction_type').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ─── Campaigns ────────────────────────────────────────────────────────────────

export const campaignChannelEnum = pgEnum('campaign_channel', ['email', 'sms'])
export const campaignTypeEnum = pgEnum('campaign_type', ['one_time', 'automated'])
export const campaignTriggerEnum = pgEnum('campaign_trigger', [
  'manual',
  'birthday',
  'win_back',
  'post_visit',
])
export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
])

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  channel: campaignChannelEnum('channel').notNull(),
  type: campaignTypeEnum('type').notNull().default('one_time'),
  trigger: campaignTriggerEnum('trigger'),
  subject: text('subject'),
  body: text('body').notNull(),
  segmentId: text('segment_id').references(() => customerSegments.id),
  status: campaignStatusEnum('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at'),
  sentAt: timestamp('sent_at'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const campaignRecipientStatusEnum = pgEnum('campaign_recipient_status', [
  'pending',
  'sent',
  'failed',
  'bounced',
  'opted_out',
])

export const campaignRecipients = pgTable('campaign_recipients', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  status: campaignRecipientStatusEnum('status').notNull().default('pending'),
  sentAt: timestamp('sent_at'),
  openedAt: timestamp('opened_at'),
  clickedAt: timestamp('clicked_at'),
})

export const campaignStats = pgTable('campaign_stats', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id')
    .notNull()
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .unique(),
  totalRecipients: integer('total_recipients').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  openCount: integer('open_count').notNull().default(0),
  clickCount: integer('click_count').notNull().default(0),
  redemptionCount: integer('redemption_count').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  tags: many(customerTagAssignments),
  visits: many(customerVisits),
  loyaltyAccounts: many(loyaltyAccounts),
  houseAccounts: many(houseAccounts),
}))

export const loyaltyProgramsRelations = relations(loyaltyPrograms, ({ many }) => ({
  tiers: many(loyaltyTiers),
  accounts: many(loyaltyAccounts),
  blackoutItems: many(loyaltyBlackoutItems),
}))

export const loyaltyAccountsRelations = relations(loyaltyAccounts, ({ one, many }) => ({
  customer: one(customers, { fields: [loyaltyAccounts.customerId], references: [customers.id] }),
  program: one(loyaltyPrograms, { fields: [loyaltyAccounts.programId], references: [loyaltyPrograms.id] }),
  tier: one(loyaltyTiers, { fields: [loyaltyAccounts.tierId], references: [loyaltyTiers.id] }),
  transactions: many(loyaltyTransactions),
}))
