/**
 * plugins/device.ts
 *
 * Verifies device certificates on every request that carries X-Device-ID.
 * Must be registered AFTER the auth plugin.
 *
 * Required request headers (Electron app only):
 *   X-Device-ID          – devices.id
 *   X-Device-Cert        – RS256 JWT signed by DEVICE_CERT_PRIVATE_KEY
 *   X-Device-Fingerprint – raw hardware fingerprint string
 *
 * Verification steps:
 *   1. All three headers must be present.
 *   2. X-Device-Cert must be a valid RS256 JWT (not expired).
 *   3. JWT subject must equal X-Device-ID.
 *   4. SHA-256(X-Device-Fingerprint) must equal the fph claim in the cert.
 *   5. Device must exist in DB with status = 'active'.
 *   6. Update device.last_seen_at (fire-and-forget, non-blocking).
 *   7. Attach request.device = { id, locationId, tenantId }.
 *
 * Any failure returns 403 with a specific error code.
 *
 * Registered in app.ts via: await app.register(devicePlugin)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { withTenantSchema, devices } from '@orderstack/db'
import { env } from '../config/env.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeviceContext {
  id: string
  locationId: string
  tenantId: string
}

interface DeviceCertPayload {
  sub: string   // device id
  tid: string   // tenant id
  lid: string   // location id
  fph: string   // SHA-256(fingerprint)
  iat: number
  exp: number
}

declare module 'fastify' {
  interface FastifyRequest {
    device?: DeviceContext
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deviceError(message: string, code: string): Error & { statusCode: number; code: string } {
  return Object.assign(new Error(message), { statusCode: 403, code })
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function devicePlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('device', undefined)

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const deviceId = request.headers['x-device-id'] as string | undefined

    // Not a device request — skip all device verification.
    if (!deviceId) return

    const deviceCert = request.headers['x-device-cert'] as string | undefined
    const deviceFingerprint = request.headers['x-device-fingerprint'] as string | undefined

    // ── 1. All three headers must be present ────────────────────────────────
    if (!deviceCert) {
      throw deviceError('Missing X-Device-Cert header', 'DEVICE_CERT_MISSING')
    }
    if (!deviceFingerprint) {
      throw deviceError('Missing X-Device-Fingerprint header', 'DEVICE_FINGERPRINT_MISSING')
    }

    // ── 2. Verify the RS256 device certificate ──────────────────────────────
    let certPayload: DeviceCertPayload
    try {
      certPayload = jwt.verify(deviceCert, env.DEVICE_CERT_PUBLIC_KEY, {
        algorithms: ['RS256'],
      }) as DeviceCertPayload
    } catch (err) {
      const code =
        err instanceof jwt.TokenExpiredError ? 'DEVICE_CERT_EXPIRED' : 'DEVICE_CERT_INVALID'
      throw deviceError(
        `Device certificate verification failed: ${(err as Error).message}`,
        code,
      )
    }

    // ── 3. Cert subject must match declared Device-ID header ─────────────────
    if (certPayload.sub !== deviceId) {
      throw deviceError('Device certificate subject mismatch', 'DEVICE_CERT_SUBJECT_MISMATCH')
    }

    // ── 4. Fingerprint hash must match fph claim ─────────────────────────────
    const incomingHash = crypto
      .createHash('sha256')
      .update(deviceFingerprint)
      .digest('hex')

    if (incomingHash !== certPayload.fph) {
      throw deviceError('Device fingerprint mismatch', 'DEVICE_FINGERPRINT_MISMATCH')
    }

    // ── 5. Look up device in the tenant DB ───────────────────────────────────
    const tenantId = certPayload.tid

    const device = await withTenantSchema(tenantId, async (tdb) => {
      const rows = await tdb
        .select()
        .from(devices)
        .where(eq(devices.id, deviceId))
        .limit(1)
      return rows[0] ?? null
    })

    if (!device) {
      throw deviceError('Device not found', 'DEVICE_NOT_FOUND')
    }

    if (device.status !== 'active') {
      const code =
        device.status === 'revoked' ? 'DEVICE_REVOKED' : 'DEVICE_FINGERPRINT_DRIFTED'
      throw deviceError(`Device is ${device.status}`, code)
    }

    // ── 6. Update last_seen_at — fire-and-forget ─────────────────────────────
    withTenantSchema(tenantId, async (tdb) => {
      await tdb
        .update(devices)
        .set({ lastSeenAt: new Date() })
        .where(eq(devices.id, deviceId))
    }).catch((err: unknown) => {
      request.log.warn({ err, deviceId }, 'Failed to update device last_seen_at')
    })

    // ── 7. Attach device context ─────────────────────────────────────────────
    request.device = {
      id: device.id,
      locationId: device.locationId,
      tenantId: device.tenantId,
    }
  })
}
