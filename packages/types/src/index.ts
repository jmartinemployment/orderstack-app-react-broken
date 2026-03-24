import { z } from 'zod'

// ─── Common ────────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
    }),
  })

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  mfaCode: z.string().length(6).optional(),
})

export const authUserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  baUserId: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
})

export type AuthUser = z.infer<typeof authUserSchema>

// ─── Devices ──────────────────────────────────────────────────────────────────

export const devicePlatformSchema = z.enum(['macos', 'windows', 'linux'])
export const deviceStatusSchema = z.enum(['active', 'revoked', 'fingerprint_drifted'])

export const registerDeviceSchema = z.object({
  fingerprint: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  platform: devicePlatformSchema,
  hostname: z.string().min(1),
  osVersion: z.string().optional(),
})

export const deviceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  locationId: z.string(),
  name: z.string(),
  fingerprint: z.string(),
  platform: devicePlatformSchema,
  hostname: z.string(),
  status: deviceStatusSchema,
  lastSeenAt: z.string().nullable(),
  registeredAt: z.string(),
})

export type Device = z.infer<typeof deviceSchema>

// ─── Products ─────────────────────────────────────────────────────────────────

export const productTypeSchema = z.enum(['item', 'modifier', 'combo', 'service'])

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  productType: productTypeSchema.default('item'),
  imageUrl: z.string().url().optional(),
  taxClassId: z.string().optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  trackInventory: z.boolean().default(false),
})

export const updateProductSchema = createProductSchema.partial()
export type CreateProduct = z.infer<typeof createProductSchema>

// ─── Orders ───────────────────────────────────────────────────────────────────

export const orderStatusSchema = z.enum([
  'open', 'in_progress', 'ready', 'completed', 'cancelled', 'voided',
])

export const orderTypeSchema = z.enum([
  'dine_in', 'takeout', 'delivery', 'online', 'catering',
])

// ─── Employees ────────────────────────────────────────────────────────────────

export const payTypeSchema = z.enum(['hourly', 'salary'])

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  hireDate: z.string().optional(),
  payType: payTypeSchema.default('hourly'),
  payRate: z.string().default('0'),
  overtimeRate: z.string().optional(),
  locationIds: z.array(z.string()).default([]),
  roleId: z.string().optional(),
})

// ─── Customers ────────────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  marketingOptIn: z.boolean().default(false),
})

// ─── API Response types ───────────────────────────────────────────────────────

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  statusCode: z.number(),
})

export type ApiError = z.infer<typeof apiErrorSchema>
