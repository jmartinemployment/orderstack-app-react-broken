import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, asc, desc } from 'drizzle-orm'
import { Queue } from 'bullmq'
import {
  chartOfAccounts,
  generalLedgerExports,
  db as publicDb,
  tenants,
} from '@orderstack/db'
import { env } from '../config/env.js'

// ─── BullMQ Queue ─────────────────────────────────────────────────────────────

const accountingQueue = new Queue('accounting-exports', {
  connection: { host: new URL(env.REDIS_URL).hostname, port: Number(new URL(env.REDIS_URL).port) || 6379 },
})

// ─── OAuth state store (in-memory for single-instance; replace with Redis in prod) ──

const oauthStateStore = new Map<string, { tenantId: string; provider: string; createdAt: number }>()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const accountTypeValues = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const
const glExportTypeValues = ['quickbooks', 'xero', 'sage', 'csv'] as const

const createAccountBody = z.object({
  accountNumber: z.string().min(1).max(20),
  accountName: z.string().min(1).max(255),
  accountType: z.enum(accountTypeValues),
  parentAccountId: z.string().optional(),
  integrationMapping: z.record(z.unknown()).optional().default({}),
})

const updateAccountBody = z.object({
  accountNumber: z.string().min(1).max(20).optional(),
  accountName: z.string().min(1).max(255).optional(),
  accountType: z.enum(accountTypeValues).optional(),
  parentAccountId: z.string().nullable().optional(),
  integrationMapping: z.record(z.unknown()).optional(),
})

const exportBody = z.object({
  exportType: z.enum(glExportTypeValues),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
})

// ─── OAuth helpers ────────────────────────────────────────────────────────────

function buildQuickBooksAuthUrl(state: string): string {
  const clientId = process.env['QB_CLIENT_ID'] ?? ''
  const redirectUri = encodeURIComponent(
    `${process.env['API_BASE_URL'] ?? 'http://localhost:3000'}/v1/accounting/connect/quickbooks/callback`,
  )
  const scope = encodeURIComponent('com.intuit.quickbooks.accounting')
  return (
    `https://appcenter.intuit.com/connect/oauth2` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&state=${state}`
  )
}

function buildXeroAuthUrl(state: string): string {
  const clientId = process.env['XERO_CLIENT_ID'] ?? ''
  const redirectUri = encodeURIComponent(
    `${process.env['API_BASE_URL'] ?? 'http://localhost:3000'}/v1/accounting/connect/xero/callback`,
  )
  const scope = encodeURIComponent('openid profile email accounting.transactions offline_access')
  return (
    `https://login.xero.com/identity/connect/authorize` +
    `?client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&state=${state}`
  )
}

function generateOAuthState(tenantId: string, provider: string): string {
  const state = nanoid(32)
  oauthStateStore.set(state, { tenantId, provider, createdAt: Date.now() })
  // Prune stale entries older than 10 minutes
  for (const [key, value] of oauthStateStore.entries()) {
    if (Date.now() - value.createdAt > 10 * 60 * 1000) {
      oauthStateStore.delete(key)
    }
  }
  return state
}

function consumeOAuthState(state: string): { tenantId: string; provider: string } | null {
  const entry = oauthStateStore.get(state)
  if (!entry) return null
  oauthStateStore.delete(state)
  if (Date.now() - entry.createdAt > 10 * 60 * 1000) return null
  return entry
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const accountingRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /accounting/chart-of-accounts — list COA
  fastify.get('/chart-of-accounts', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.tenantId, request.user!.tenantId))
      .orderBy(asc(chartOfAccounts.accountNumber))

    return reply.send({ data: accounts })
  })

  // POST /accounting/chart-of-accounts — create account
  fastify.post('/chart-of-accounts', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createAccountBody.parse(request.body)
    const id = nanoid()
    const now = new Date()

    // Validate parent exists if provided
    if (body.parentAccountId) {
      const [parent] = await db
        .select()
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.id, body.parentAccountId),
            eq(chartOfAccounts.tenantId, request.user!.tenantId),
          ),
        )

      if (!parent) {
        return reply.status(404).send({ error: 'Parent account not found' })
      }
    }

    await db.insert(chartOfAccounts).values({
      id,
      tenantId: request.user!.tenantId,
      accountNumber: body.accountNumber,
      accountName: body.accountName,
      accountType: body.accountType,
      parentAccountId: body.parentAccountId ?? null,
      integrationMapping: body.integrationMapping ?? {},
      createdAt: now,
      updatedAt: now,
    })

    const [account] = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.id, id))

    return reply.status(201).send(account)
  })

  // PATCH /accounting/chart-of-accounts/:id — update account
  fastify.patch('/chart-of-accounts/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateAccountBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.id, id),
          eq(chartOfAccounts.tenantId, request.user!.tenantId),
        ),
      )

    if (!existing) {
      return reply.status(404).send({ error: 'Account not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.accountNumber !== undefined) updateData.accountNumber = body.accountNumber
    if (body.accountName !== undefined) updateData.accountName = body.accountName
    if (body.accountType !== undefined) updateData.accountType = body.accountType
    if (body.parentAccountId !== undefined) updateData.parentAccountId = body.parentAccountId
    if (body.integrationMapping !== undefined)
      updateData.integrationMapping = body.integrationMapping

    const [updated] = await db
      .update(chartOfAccounts)
      .set(updateData)
      .where(eq(chartOfAccounts.id, id))
      .returning()

    return reply.send(updated)
  })

  // POST /accounting/connect/quickbooks — return OAuth2 auth URL
  fastify.post('/connect/quickbooks', async (request, reply) => {
    await request.authenticate()

    const state = generateOAuthState(request.user!.tenantId, 'quickbooks')
    const authUrl = buildQuickBooksAuthUrl(state)

    return reply.send({ authUrl })
  })

  // GET /accounting/connect/quickbooks/callback — handle OAuth2 callback
  fastify.get('/connect/quickbooks/callback', async (request, reply) => {
    const { code, state, realmId } = request.query as {
      code?: string
      state?: string
      realmId?: string
    }

    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state parameter' })
    }

    const stateData = consumeOAuthState(state)
    if (!stateData) {
      return reply.status(400).send({ error: 'Invalid or expired OAuth state' })
    }

    // Exchange code for tokens
    const clientId = process.env['QB_CLIENT_ID'] ?? ''
    const clientSecret = process.env['QB_CLIENT_SECRET'] ?? ''
    const redirectUri = `${process.env['API_BASE_URL'] ?? 'http://localhost:3000'}/v1/accounting/connect/quickbooks/callback`

    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      request.log.error({ status: tokenResponse.status, body: errorText }, 'QuickBooks token exchange failed')
      return reply.status(502).send({ error: 'Failed to exchange authorization code with QuickBooks' })
    }

    const tokens = await tokenResponse.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      x_refresh_token_expires_in: number
    }

    // Persist tokens to tenant settings via the tenants table in public schema.
    // In production, replace with a dedicated encrypted secrets store.
    request.log.info(
      { tenantId: stateData.tenantId, realmId },
      'QuickBooks OAuth tokens obtained — storing in tenant settings',
    )

    // Read existing settings so we can merge rather than overwrite
    const [currentTenant] = await publicDb
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, stateData.tenantId))

    const currentSettings = (currentTenant?.settings as Record<string, unknown>) ?? {}

    await publicDb
      .update(tenants)
      .set({
        settings: {
          ...currentSettings,
          quickbooks: {
            realmId: realmId ?? null,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            refreshExpiresAt: new Date(
              Date.now() + tokens.x_refresh_token_expires_in * 1000,
            ).toISOString(),
            connectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, stateData.tenantId))

    return reply.send({ success: true, provider: 'quickbooks' })
  })

  // POST /accounting/connect/xero — return Xero OAuth2 auth URL
  fastify.post('/connect/xero', async (request, reply) => {
    await request.authenticate()

    const state = generateOAuthState(request.user!.tenantId, 'xero')
    const authUrl = buildXeroAuthUrl(state)

    return reply.send({ authUrl })
  })

  // GET /accounting/connect/xero/callback — handle Xero callback
  fastify.get('/connect/xero/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string }

    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state parameter' })
    }

    const stateData = consumeOAuthState(state)
    if (!stateData) {
      return reply.status(400).send({ error: 'Invalid or expired OAuth state' })
    }

    const clientId = process.env['XERO_CLIENT_ID'] ?? ''
    const clientSecret = process.env['XERO_CLIENT_SECRET'] ?? ''
    const redirectUri = `${process.env['API_BASE_URL'] ?? 'http://localhost:3000'}/v1/accounting/connect/xero/callback`

    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      request.log.error({ status: tokenResponse.status, body: errorText }, 'Xero token exchange failed')
      return reply.status(502).send({ error: 'Failed to exchange authorization code with Xero' })
    }

    const tokens = await tokenResponse.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    const [currentTenantXero] = await publicDb
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, stateData.tenantId))

    const currentSettingsXero = (currentTenantXero?.settings as Record<string, unknown>) ?? {}

    await publicDb
      .update(tenants)
      .set({
        settings: {
          ...currentSettingsXero,
          xero: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            connectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, stateData.tenantId))

    return reply.send({ success: true, provider: 'xero' })
  })

  // DELETE /accounting/connect/:provider — disconnect integration
  fastify.delete('/connect/:provider', async (request, reply) => {
    await request.authenticate()

    const { provider } = request.params as { provider: string }
    const validProviders = ['quickbooks', 'xero', 'sage']

    if (!validProviders.includes(provider)) {
      return reply.status(400).send({ error: `Unknown provider '${provider}'` })
    }

    const [tenant] = await publicDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, request.user!.tenantId))

    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant not found' })
    }

    const settings = (tenant.settings as Record<string, unknown>) ?? {}

    if (!settings[provider]) {
      return reply.status(404).send({ error: `No ${provider} integration connected` })
    }

    const updatedSettings = { ...settings }
    delete updatedSettings[provider]

    await publicDb
      .update(tenants)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(eq(tenants.id, request.user!.tenantId))

    return reply.status(204).send()
  })

  // POST /accounting/export — create GL export job
  fastify.post('/export', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = exportBody.parse(request.body)
    const exportId = nanoid()
    const now = new Date()

    // Create the GL export row
    await db.insert(generalLedgerExports).values({
      id: exportId,
      tenantId: request.user!.tenantId,
      exportType: body.exportType,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      status: 'pending',
      fileUrl: null,
      jobId: null,
      errorMessage: null,
      exportedAt: null,
      exportedBy: request.user!.id,
      createdAt: now,
    })

    // Enqueue BullMQ job
    const job = await accountingQueue.add(
      'gl-export',
      {
        exportId,
        tenantId: request.user!.tenantId,
        exportType: body.exportType,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        userId: request.user!.id,
      },
      {
        removeOnComplete: { age: 60 * 60 * 24 * 7 },
        removeOnFail: { age: 60 * 60 * 24 * 30 },
      },
    )

    // Store the BullMQ job ID in the export row
    await db
      .update(generalLedgerExports)
      .set({ jobId: job.id ?? null })
      .where(eq(generalLedgerExports.id, exportId))

    return reply.status(202).send({ exportId, jobId: job.id })
  })

  // GET /accounting/exports — list GL exports
  fastify.get('/exports', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const exports = await db
      .select()
      .from(generalLedgerExports)
      .where(eq(generalLedgerExports.tenantId, request.user!.tenantId))
      .orderBy(desc(generalLedgerExports.createdAt))
      .limit(50)

    return reply.send({ data: exports })
  })

  // GET /accounting/exports/:id — get export detail with optional presigned URL
  fastify.get('/exports/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [glExport] = await db
      .select()
      .from(generalLedgerExports)
      .where(
        and(
          eq(generalLedgerExports.id, id),
          eq(generalLedgerExports.tenantId, request.user!.tenantId),
        ),
      )

    if (!glExport) {
      return reply.status(404).send({ error: 'Export not found' })
    }

    // If complete, return the stored file URL directly
    // (In production, fileUrl is a pre-signed R2/S3 URL set by the BullMQ worker)
    return reply.send({
      ...glExport,
      fileUrl: glExport.status === 'complete' ? (glExport.fileUrl ?? null) : null,
    })
  })
}
