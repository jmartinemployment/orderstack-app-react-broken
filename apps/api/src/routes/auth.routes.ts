/**
 * routes/auth.routes.ts
 *
 * Authentication routes registered at prefix /v1/auth:
 *
 *   POST /auth/login           – verify credentials, issue access + refresh tokens
 *   POST /auth/logout          – clear refresh cookie, delete sessions
 *   POST /auth/refresh         – exchange refresh cookie for a new access token
 *   POST /auth/mfa/setup       – generate TOTP secret, return QR code URL
 *   POST /auth/mfa/verify      – verify TOTP code, mark mfa_enabled = true
 *   POST /auth/forgot-password – send password reset email via Resend
 *   POST /auth/reset-password  – verify reset token, update password hash
 *
 * Token design:
 *   Access token:  HS256 JWT, 15 min, contains { sub, tenant_id, user_id, email }
 *   Refresh token: HS256 JWT, 7 days, stored as httpOnly cookie named 'refresh_token'
 *
 * The accountId column in ba_account is stored as "{tenantId}:{userId}" by the
 * device registration / user provisioning flow so that the login handler can
 * derive both tenant and user IDs from a single public-schema query.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import crypto from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import {
  db,
  withTenantSchema,
  baUser,
  baSession,
  baAccount,
  baVerification,
  users,
} from '@orderstack/db'
import { env } from '../config/env.js'
import { auth as betterAuth } from '../plugins/auth.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 7 // 7 days in seconds
const REFRESH_COOKIE = 'refresh_token'
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000 // 1 hour
const MFA_SETUP_TTL_MS = 10 * 60 * 1000      // 10 minutes
const TOTP_STEP = 30                           // seconds per window
const TOTP_DIGITS = 6

// ─── Token helpers ────────────────────────────────────────────────────────────

function issueAccessToken(payload: {
  sub: string
  tenant_id: string
  user_id: string
  email: string
}): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL,
  })
}

function issueRefreshToken(baUserId: string, tenantId: string): string {
  return jwt.sign(
    { sub: baUserId, tenant_id: tenantId, type: 'refresh' },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: `${REFRESH_TOKEN_TTL_S}s` },
  )
}

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_S,
  })
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' })
}

// ─── TOTP helpers (RFC 6238 / HOTP base) ─────────────────────────────────────

/** Generate a random 20-byte base32-encoded TOTP secret. */
function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20)
  // Base32 encode (RFC 4648 alphabet, no padding)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let result = ''
  let buffer = 0
  let bitsLeft = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bitsLeft += 8
    while (bitsLeft >= 5) {
      bitsLeft -= 5
      result += alphabet[(buffer >> bitsLeft) & 0x1f]
    }
  }
  if (bitsLeft > 0) {
    result += alphabet[(buffer << (5 - bitsLeft)) & 0x1f]
  }
  return result
}

/** Decode a base32 string to a Buffer. */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = encoded.toUpperCase().replace(/=+$/, '')
  let buffer = 0
  let bitsLeft = 0
  const output: number[] = []
  for (const char of clean) {
    const val = alphabet.indexOf(char)
    if (val < 0) continue
    buffer = (buffer << 5) | val
    bitsLeft += 5
    if (bitsLeft >= 8) {
      bitsLeft -= 8
      output.push((buffer >> bitsLeft) & 0xff)
    }
  }
  return Buffer.from(output)
}

/** Compute a 6-digit HOTP value for the given key and counter. */
function hotp(keyBuffer: Buffer, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(counter)
  const hmac = crypto.createHmac('sha1', keyBuffer).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff)
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/**
 * Verify a TOTP code against a base32 secret.
 * Allows one step of clock drift in either direction.
 */
function verifyTotp(code: string, secret: string): boolean {
  const keyBuffer = base32Decode(secret)
  const now = Math.floor(Date.now() / 1000)
  const counter = BigInt(Math.floor(now / TOTP_STEP))

  for (const delta of [-1n, 0n, 1n]) {
    if (hotp(keyBuffer, counter + delta) === code) return true
  }
  return false
}

/** Build an otpauth:// URL suitable for QR code generation. */
function buildOtpAuthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`OrderStack:${email}`)
  const issuer = encodeURIComponent('OrderStack')
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const mfaVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {
  // ── POST /login ────────────────────────────────────────────────────────────
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
    }
    const { email, password } = body.data

    // Verify credentials via Better Auth internal API
    let signInResult: { user: { id: string; email: string; name: string } } | null = null
    try {
      signInResult = (await betterAuth.api.signInEmail({
        body: { email, password },
      })) as unknown as typeof signInResult
    } catch {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }

    if (!signInResult) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }

    const baUserId = (signInResult as Record<string, Record<string, string>>)["user"]["id"]

    // Derive tenant + user IDs from ba_account.accountId = "{tenantId}:{userId}"
    // This convention is set during user provisioning / device registration.
    const account = await db
      .select()
      .from(baAccount)
      .where(and(eq(baAccount.userId, baUserId), eq(baAccount.providerId, 'credential')))
      .limit(1)

    if (!account[0]) {
      return reply.status(401).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' })
    }

    const separatorIdx = account[0].accountId.indexOf(':')
    if (separatorIdx === -1) {
      return reply
        .status(500)
        .send({ error: 'Account mapping invalid', code: 'ACCOUNT_MAPPING_INVALID' })
    }

    const tenantId = account[0].accountId.slice(0, separatorIdx)
    const tenantUserId = account[0].accountId.slice(separatorIdx + 1)

    if (!tenantId || !tenantUserId) {
      return reply
        .status(500)
        .send({ error: 'Account mapping invalid', code: 'ACCOUNT_MAPPING_INVALID' })
    }

    // Load tenant-schema user record for the full profile
    const tenantUser = await withTenantSchema(tenantId, async (tdb) => {
      const rows = await tdb.select().from(users).where(eq(users.id, tenantUserId)).limit(1)
      return rows[0] ?? null
    })

    if (!tenantUser) {
      return reply.status(404).send({ error: 'User not found in tenant', code: 'TENANT_USER_NOT_FOUND' })
    }

    if (!tenantUser.isActive) {
      return reply.status(403).send({ error: 'User account is inactive', code: 'USER_INACTIVE' })
    }

    const accessToken = issueAccessToken({
      sub: baUserId,
      tenant_id: tenantId,
      user_id: tenantUserId,
      email: tenantUser.email,
    })
    const refreshToken = issueRefreshToken(baUserId, tenantId)

    setRefreshCookie(reply, refreshToken)

    return reply.status(200).send({
      accessToken,
      user: {
        id: tenantUser.id,
        email: tenantUser.email,
        firstName: tenantUser.firstName,
        lastName: tenantUser.lastName,
        tenantId: tenantUser.tenantId,
      },
    })
  })

  // ── POST /logout ───────────────────────────────────────────────────────────
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]

    if (token) {
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string }
        // Delete all sessions for this user
        await db.delete(baSession).where(eq(baSession.userId, payload.sub))
      } catch {
        // Token is already invalid or expired — proceed to clear cookie
      }
    }

    clearRefreshCookie(reply)
    return reply.status(200).send({ success: true })
  })

  // ── POST /refresh ──────────────────────────────────────────────────────────
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]

    if (!token) {
      return reply.status(401).send({ error: 'No refresh token', code: 'REFRESH_TOKEN_MISSING' })
    }

    let payload: { sub: string; tenant_id: string; type: string }
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as typeof payload
    } catch (err) {
      clearRefreshCookie(reply)
      const code =
        err instanceof jwt.TokenExpiredError
          ? 'REFRESH_TOKEN_EXPIRED'
          : 'REFRESH_TOKEN_INVALID'
      return reply.status(401).send({ error: 'Refresh token invalid', code })
    }

    if (payload.type !== 'refresh') {
      clearRefreshCookie(reply)
      return reply.status(401).send({ error: 'Invalid token type', code: 'TOKEN_TYPE_INVALID' })
    }

    const { sub: baUserId, tenant_id: tenantId } = payload

    // Verify the user still exists
    const baUserRow = await db.select({ id: baUser.id }).from(baUser).where(eq(baUser.id, baUserId)).limit(1)
    if (!baUserRow[0]) {
      clearRefreshCookie(reply)
      return reply.status(401).send({ error: 'User not found', code: 'USER_NOT_FOUND' })
    }

    // Reload account mapping
    const account = await db
      .select()
      .from(baAccount)
      .where(and(eq(baAccount.userId, baUserId), eq(baAccount.providerId, 'credential')))
      .limit(1)

    if (!account[0]) {
      return reply.status(401).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' })
    }

    const separatorIdx = account[0].accountId.indexOf(':')
    const tenantUserId =
      separatorIdx >= 0 ? account[0].accountId.slice(separatorIdx + 1) : null

    if (!tenantUserId) {
      return reply
        .status(500)
        .send({ error: 'Account mapping invalid', code: 'ACCOUNT_MAPPING_INVALID' })
    }

    const tenantUser = await withTenantSchema(tenantId, async (tdb) => {
      const rows = await tdb.select().from(users).where(eq(users.id, tenantUserId)).limit(1)
      return rows[0] ?? null
    })

    if (!tenantUser || !tenantUser.isActive) {
      return reply.status(403).send({ error: 'User account is inactive', code: 'USER_INACTIVE' })
    }

    const newAccessToken = issueAccessToken({
      sub: baUserId,
      tenant_id: tenantId,
      user_id: tenantUserId,
      email: tenantUser.email,
    })

    // Rotate refresh token on every use
    const newRefreshToken = issueRefreshToken(baUserId, tenantId)
    setRefreshCookie(reply, newRefreshToken)

    return reply.status(200).send({ accessToken: newAccessToken })
  })

  // ── POST /mfa/setup ────────────────────────────────────────────────────────
  fastify.post('/mfa/setup', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate()
    const { baUserId, email } = request.user!

    const secret = generateTotpSecret()
    const otpAuthUrl = buildOtpAuthUrl(email, secret)
    const expiresAt = new Date(Date.now() + MFA_SETUP_TTL_MS)
    const identifier = `mfa:${baUserId}`

    // Upsert the pending MFA secret in ba_verification
    const existing = await db
      .select({ id: baVerification.id })
      .from(baVerification)
      .where(eq(baVerification.identifier, identifier))
      .limit(1)

    if (existing[0]) {
      await db
        .update(baVerification)
        .set({ value: secret, expiresAt, updatedAt: new Date() })
        .where(eq(baVerification.identifier, identifier))
    } else {
      await db.insert(baVerification).values({
        id: nanoid(),
        identifier,
        value: secret,
        expiresAt,
      })
    }

    // Return the raw otpauth URL; the client renders the QR code itself.
    // Alternatively clients can display the manual-entry secret.
    return reply.status(200).send({ secret, qrCodeUrl: otpAuthUrl })
  })

  // ── POST /mfa/verify ───────────────────────────────────────────────────────
  fastify.post('/mfa/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate()
    const { baUserId, id: userId, tenantId } = request.user!

    const body = mfaVerifySchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
    }

    const identifier = `mfa:${baUserId}`
    const verification = await db
      .select()
      .from(baVerification)
      .where(eq(baVerification.identifier, identifier))
      .limit(1)

    if (!verification[0]) {
      return reply.status(400).send({ error: 'MFA setup not initiated', code: 'MFA_NOT_INITIATED' })
    }

    if (verification[0].expiresAt < new Date()) {
      await db.delete(baVerification).where(eq(baVerification.identifier, identifier))
      return reply.status(400).send({ error: 'MFA setup session expired', code: 'MFA_SETUP_EXPIRED' })
    }

    if (!verifyTotp(body.data.code, verification[0].value)) {
      return reply.status(400).send({ error: 'Invalid TOTP code', code: 'TOTP_INVALID' })
    }

    // Mark MFA enabled on the tenant-schema user
    await withTenantSchema(tenantId, async (tdb) => {
      await tdb
        .update(users)
        .set({ mfaEnabled: true, updatedAt: new Date() })
        .where(eq(users.id, userId))
    })

    // Remove the one-time setup record
    await db.delete(baVerification).where(eq(baVerification.identifier, identifier))

    return reply.status(200).send({ success: true, mfaEnabled: true })
  })

  // ── POST /forgot-password ──────────────────────────────────────────────────
  fastify.post('/forgot-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = forgotPasswordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
    }

    // Always 200 to prevent email enumeration
    const baUserRow = await db
      .select()
      .from(baUser)
      .where(eq(baUser.email, body.data.email))
      .limit(1)

    if (baUserRow[0] && env.RESEND_API_KEY) {
      const resetToken = nanoid(48)
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
      const identifier = `reset:${baUserRow[0].id}`

      const existing = await db
        .select({ id: baVerification.id })
        .from(baVerification)
        .where(eq(baVerification.identifier, identifier))
        .limit(1)

      if (existing[0]) {
        await db
          .update(baVerification)
          .set({ value: resetToken, expiresAt, updatedAt: new Date() })
          .where(eq(baVerification.identifier, identifier))
      } else {
        await db.insert(baVerification).values({
          id: nanoid(),
          identifier,
          value: resetToken,
          expiresAt,
        })
      }

      // Lazy import — resend is optional; skip if RESEND_API_KEY is absent.
      const { Resend } = await import('resend')
      const resend = new Resend(env.RESEND_API_KEY)

      resend.emails
        .send({
          from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
          to: body.data.email,
          subject: 'Reset your OrderStack password',
          html: `
            <p>You requested a password reset.</p>
            <p>
              <a href="https://app.orderstack.io/reset-password?token=${resetToken}">
                Click here to reset your password
              </a>
            </p>
            <p>This link expires in 1 hour.</p>
            <p>If you did not request this, you can safely ignore this email.</p>
          `,
        })
        .catch((err: unknown) => {
          request.log.error({ err }, 'Failed to send password reset email')
        })
    }

    return reply.status(200).send({ success: true })
  })

  // ── POST /reset-password ───────────────────────────────────────────────────
  fastify.post('/reset-password', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = resetPasswordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
    }

    const { token, newPassword } = body.data

    // Find the verification row that holds this reset token.
    // Tokens are stored in baVerification.value under identifiers prefixed with 'reset:'.
    // We do a bounded scan and match on value.
    const allResetRows = await db
      .select()
      .from(baVerification)
      .limit(500)

    const verification = allResetRows.find(
      (r) => r.identifier.startsWith('reset:') && r.value === token,
    )

    if (!verification) {
      return reply
        .status(400)
        .send({ error: 'Invalid or expired reset token', code: 'RESET_TOKEN_INVALID' })
    }

    if (verification.expiresAt < new Date()) {
      await db.delete(baVerification).where(eq(baVerification.identifier, verification.identifier))
      return reply.status(400).send({ error: 'Reset token has expired', code: 'RESET_TOKEN_EXPIRED' })
    }

    const baUserId = verification.identifier.replace('reset:', '')

    // Hash the new password using Node's built-in scrypt (no external dependency).
    // Better Auth's credential provider compares passwords — we need to store in
    // the same format it uses. Better Auth v1 uses scrypt by default.
    // Format: scrypt$N$r$p$salt$hash (all base64url)
    const salt = crypto.randomBytes(16).toString('base64url')
    const N = 16384
    const r = 8
    const p = 1
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(newPassword, salt, 32, { N, r, p }, (err, key) => {
        if (err) reject(err)
        else resolve(key)
      })
    })
    const passwordHash = `scrypt$${N}$${r}$${p}$${salt}$${derivedKey.toString('base64url')}`

    await db
      .update(baAccount)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(baAccount.userId, baUserId), eq(baAccount.providerId, 'credential')))

    // Invalidate all existing sessions for security
    await db.delete(baSession).where(eq(baSession.userId, baUserId))

    // Consume the reset token
    await db.delete(baVerification).where(eq(baVerification.identifier, verification.identifier))

    return reply.status(200).send({ success: true })
  })
}
