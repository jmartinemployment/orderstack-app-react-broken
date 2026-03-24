import { z } from 'zod'
import { readFileSync } from 'node:fs'

/**
 * Render.com stores some secrets as Secret Files rather than environment
 * variables. Secret Files are accessible at /etc/secrets/<filename> at runtime.
 * This helper reads a secret file and returns its trimmed content, or falls
 * back to the provided environment variable value if the file doesn't exist.
 *
 * Files configured in Render Secret Files:
 *   CSRF_SECRET, MFA_ENCRYPTION_KEY, PAYPAL_CLIENT_SECRET, RESEND_API_KEY
 */
function readSecretFile(filename: string, fallback?: string): string | undefined {
  try {
    return readFileSync(`/etc/secrets/${filename}`, 'utf-8').trim()
  } catch {
    return fallback
  }
}

/**
 * Environment variables.
 * Values come from:
 *   1. Render.com Environment Variables dashboard (env vars)
 *   2. Render.com Secret Files (/etc/secrets/<filename>)
 *   3. Local .env file in development
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Supabase — pooler URL (Supavisor, transaction mode) — set in Render env vars
  DATABASE_URL: z.string().min(1),
  // Supabase — direct URL for migrations only — set in Render env vars
  DIRECT_URL: z.string().optional(),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT signing — set in Render env vars
  JWT_SECRET: z.string().min(32),

  // Device certificate signing (RS256) — set in Render env vars
  DEVICE_CERT_PRIVATE_KEY: z.string().min(1),
  DEVICE_CERT_PUBLIC_KEY: z.string().min(1),
  DEVICE_CERT_TTL: z.coerce.number().default(31536000),

  // PayPal — PAYPAL_CLIENT_SECRET comes from Render Secret File
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_PARTNER_ID: z.string().optional(),
  PAYPAL_BN_CODE: z.string().optional(),

  // Email — RESEND_API_KEY comes from Render Secret File
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

  // Security secrets — come from Render Secret Files
  CSRF_SECRET: z.string().optional(),
  MFA_ENCRYPTION_KEY: z.string().optional(),

  // Monitoring
  SENTRY_DSN_API: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),

  // App
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  FRONTEND_URL: z.string().optional(),
})

// Merge Secret File values into process.env before validation.
// Secret Files take precedence over env vars for the same key.
const rawEnv = {
  ...process.env,
  PAYPAL_CLIENT_SECRET: readSecretFile('PAYPAL_CLIENT_SECRET', process.env['PAYPAL_CLIENT_SECRET']),
  RESEND_API_KEY: readSecretFile('RESEND_API_KEY', process.env['RESEND_API_KEY']),
  CSRF_SECRET: readSecretFile('CSRF_SECRET', process.env['CSRF_SECRET']),
  MFA_ENCRYPTION_KEY: readSecretFile('MFA_ENCRYPTION_KEY', process.env['MFA_ENCRYPTION_KEY']),
}

const parsed = envSchema.safeParse(rawEnv)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
