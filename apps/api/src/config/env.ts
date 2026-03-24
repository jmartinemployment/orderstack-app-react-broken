import { z } from 'zod'

/**
 * Environment variables.
 * All values are set in Render.com's environment variable dashboard.
 * The keys below match exactly what is configured in Render.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Supabase — pooler URL for runtime queries (Supavisor, transaction mode)
  DATABASE_URL: z.string().min(1),
  // Supabase — direct URL for migrations only (bypasses pooler)
  DIRECT_URL: z.string().optional(),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Used as Better Auth secret AND JWT signing secret
  JWT_SECRET: z.string().min(32),

  // Device certificate signing (RS256) — stored in Render env vars
  DEVICE_CERT_PRIVATE_KEY: z.string().min(1),
  DEVICE_CERT_PUBLIC_KEY: z.string().min(1),
  DEVICE_CERT_TTL: z.coerce.number().default(31536000),

  // PayPal (present in Render)
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),

  // Email
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@orderstack.io'),
  RESEND_FROM_NAME: z.string().default('OrderStack'),

  // SMS
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Storage
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().default('orderstack-assets'),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().default('https://assets.orderstack.io'),

  // Search
  MEILISEARCH_URL: z.string().default('http://localhost:7700'),
  MEILISEARCH_MASTER_KEY: z.string().optional(),

  // Accounting OAuth
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_REDIRECT_URI: z.string().optional(),
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),
  XERO_REDIRECT_URI: z.string().optional(),

  // Monitoring
  SENTRY_DSN_API: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),

  // App
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  FRONTEND_URL: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
