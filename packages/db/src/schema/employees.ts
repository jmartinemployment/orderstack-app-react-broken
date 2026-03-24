import { pgTable, text, timestamp, boolean, numeric, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'

export const payTypeEnum = pgEnum('pay_type', ['hourly', 'salary'])
export const timeEntryStatusEnum = pgEnum('time_entry_status', ['open', 'closed', 'approved'])
export const scheduleStatusEnum = pgEnum('schedule_status', ['draft', 'published', 'archived'])
export const shiftStatusEnum = pgEnum('shift_status', [
  'scheduled',
  'accepted',
  'declined',
  'swapped',
])
export const requestStatusEnum = pgEnum('request_status', [
  'pending',
  'approved',
  'declined',
  'cancelled',
])

/**
 * An employee record always exists independently of a user account.
 * Kitchen staff, dishwashers, etc. clock in via PIN and never need a back-office login.
 * Managers and owners get a linked user account via userId.
 */
export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** FK → users.id; NULLABLE — PIN-only employees have no user account */
  userId: text('user_id').references(() => users.id),
  employeeNumber: text('employee_number'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  hireDate: timestamp('hire_date'),
  terminationDate: timestamp('termination_date'),
  payType: payTypeEnum('pay_type').notNull().default('hourly'),
  payRate: numeric('pay_rate', { precision: 10, scale: 2 }).notNull().default('0'),
  overtimeRate: numeric('overtime_rate', { precision: 10, scale: 2 }),
  locationIds: jsonb('location_ids').notNull().default('[]'),
  roleId: text('role_id'),
  /**
   * PBKDF2-hashed PIN for POS clock-in.
   * Set and managed via PATCH /employees/:id/pin.
   * Always present regardless of whether userId is set.
   */
  pinHash: text('pin_hash'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const timeEntries = pgTable('time_entries', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  locationId: text('location_id').notNull(),
  clockIn: timestamp('clock_in').notNull(),
  clockOut: timestamp('clock_out'),
  breakMinutes: integer('break_minutes').notNull().default(0),
  regularHours: numeric('regular_hours', { precision: 6, scale: 2 }),
  overtimeHours: numeric('overtime_hours', { precision: 6, scale: 2 }),
  grossPay: numeric('gross_pay', { precision: 10, scale: 2 }),
  status: timeEntryStatusEnum('status').notNull().default('open'),
  approvedBy: text('approved_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const schedules = pgTable('schedules', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  locationId: text('location_id').notNull(),
  weekStartDate: text('week_start_date').notNull(),
  status: scheduleStatusEnum('status').notNull().default('draft'),
  publishedAt: timestamp('published_at'),
  publishedBy: text('published_by'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const scheduleShifts = pgTable('schedule_shifts', {
  id: text('id').primaryKey(),
  scheduleId: text('schedule_id')
    .notNull()
    .references(() => schedules.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id')
    .notNull()
    .references(() => employees.id),
  roleId: text('role_id'),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  breakMinutes: integer('break_minutes').notNull().default(0),
  notes: text('notes'),
  status: shiftStatusEnum('status').notNull().default('scheduled'),
})

export const shiftSwapRequests = pgTable('shift_swap_requests', {
  id: text('id').primaryKey(),
  originalShiftId: text('original_shift_id')
    .notNull()
    .references(() => scheduleShifts.id),
  requestingEmployeeId: text('requesting_employee_id')
    .notNull()
    .references(() => employees.id),
  targetEmployeeId: text('target_employee_id')
    .notNull()
    .references(() => employees.id),
  status: requestStatusEnum('status').notNull().default('pending'),
  approvedBy: text('approved_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const timeOffRequests = pgTable('time_off_requests', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id')
    .notNull()
    .references(() => employees.id, { onDelete: 'cascade' }),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  reason: text('reason'),
  status: requestStatusEnum('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  timeEntries: many(timeEntries),
  scheduleShifts: many(scheduleShifts),
  timeOffRequests: many(timeOffRequests),
}))

export const schedulesRelations = relations(schedules, ({ many }) => ({
  shifts: many(scheduleShifts),
}))

export const scheduleShiftsRelations = relations(scheduleShifts, ({ one }) => ({
  schedule: one(schedules, { fields: [scheduleShifts.scheduleId], references: [schedules.id] }),
  employee: one(employees, { fields: [scheduleShifts.employeeId], references: [employees.id] }),
}))
