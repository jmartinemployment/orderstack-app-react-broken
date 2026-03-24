/**
 * routes/devices.routes.ts
 *
 * Device management routes:
 *   GET    /devices                – list all devices for the tenant
 *   POST   /devices/register       – register a new device, issue RS256 cert
 *   GET    /devices/:id            – get device detail + recent access log
 *   PATCH  /devices/:id            – update name or locationId
 *   DELETE /devices/:id            – revoke device
 *   GET    /devices/:id/access-log – paginated access log
 *   POST   /devices/:id/renew      – renew expiring certificate
 *
 * Registered at prefix /v1/devices in app.ts.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import crypto from 'node:crypto'
import { eq, and, desc } from 'drizzle-orm'
import {
  withTenantSchema,
  devices,
  deviceAccessLog,
} from '@orderstack/db'
import { env } from '../config/env.js'

// ─── Validation schemas ───────────────────────────────────────────────────────

const registerDeviceSchema = z.object({
  fingerprint: z.string().min(8),
  locationId: z.string().min(1),
  name: z.string().min(1).max(100),
  platform: z.enum(['macos', 'windows', 'linux']),
  hostname: z.string().min(1).max(253),
  osVersion: z.string().optional(),
})

const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  locationId: z.string().min(1).optional(),
}).refine((d) => d.name !== undefined || d.locationId !== undefined, {
  message: 'At least one field (name or locationId) must be provided',
})

const accessLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Certificate helpers ──────────────────────────────────────────────────────

interface DeviceCertPayload {
  sub: string   // device id
  tid: string   // tenant id
  lid: string   // location id
  fph: string   // SHA-256(fingerprint)
  iat: number
  exp: number
}

function fingerprintHash(fingerprint: string): string {
  return crypto.createHash('sha256').update(fingerprint).digest('hex')
}

function signDeviceCert(payload: Omit<DeviceCertPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { ...payload, iat: now, exp: now + env.DEVICE_CERT_TTL },
    env.DEVICE_CERT_PRIVATE_KEY,
    { algorithm: 'RS256' },
  )
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function devicesRoutes(fastify: FastifyInstance) {
  // ── GET /devices ───────────────────────────────────────────────────────────
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate()
    await request.requirePermission('devices', 'read')

    const { tenantId } = request.user!

    const rows = await withTenantSchema(tenantId, async (tdb) => {
      return tdb
        .select({
          id: devices.id,
          tenantId: devices.tenantId,
          locationId: devices.locationId,
          name: devices.name,
          platform: devices.platform,
          hostname: devices.hostname,
          osVersion: devices.osVersion,
          appVersion: devices.appVersion,
          status: devices.status,
          lastSeenAt: devices.lastSeenAt,
          registeredAt: devices.registeredAt,
          registeredBy: devices.registeredBy,
        })
        .from(devices)
        .where(eq(devices.tenantId, tenantId))
        .orderBy(desc(devices.registeredAt))
    })

    return reply.status(200).send({ devices: rows, total: rows.length })
  })

  // ── POST /devices/register ─────────────────────────────────────────────────
  fastify.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate()
    await request.requirePermission('devices', 'write')

    const body = registerDeviceSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
    }

    const { fingerprint, locationId, name, platform, hostname, osVersion } = body.data
    const { tenantId, id: registeredBy } = request.user!

    const deviceId = nanoid()
    const fph = fingerprintHash(fingerprint)
    const certificate = signDeviceCert({ sub: deviceId, tid: tenantId, lid: locationId, fph })

    await withTenantSchema(tenantId, async (tdb) => {
      await tdb.insert(devices).values({
        id: deviceId,
        tenantId,
        locationId,
        name,
        fingerprint: fph,
        certificate,
        platform,
        hostname,
        osVersion: osVersion ?? null,
        status: 'active',
        registeredBy,
        registeredAt: new Date(),
      })

      // Log the registration event
      await tdb.insert(deviceAccessLog).values({
        id: nanoid(),
        deviceId,
        userId: registeredBy,
        action: 'registered',
        ipAddress: request.ip,
      })
    })

    request.auditAfter = { deviceId, tenantId, locationId, name, platform, hostname }

    return reply.status(201).send({ deviceId, certificate })
  })

  // ── GET /devices/:id ───────────────────────────────────────────────────────
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await request.authenticate()
    await request.requirePermission('devices', 'read')

    const { tenantId } = request.user!
    const { id } = request.params

    const result = await withTenantSchema(tenantId, async (tdb) => {
      const [device] = await tdb
        .select()
        .from(devices)
        .where(and(eq(devices.id, id), eq(devices.tenantId, tenantId)))
        .limit(1)

      if (!device) return null

      // Fetch last 20 access log entries
      const log = await tdb
        .select()
        .from(deviceAccessLog)
        .where(eq(deviceAccessLog.deviceId, id))
        .orderBy(desc(deviceAccessLog.createdAt))
        .limit(20)

      return { ...device, recentAccessLog: log }
    })

    if (!result) {
      return reply.status(404).send({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' })
    }

    return reply.status(200).send(result)
  })

  // ── PATCH /devices/:id ─────────────────────────────────────────────────────
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await request.authenticate()
    await request.requirePermission('devices', 'write')

    const body = updateDeviceSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
    }

    const { tenantId } = request.user!
    const { id } = request.params

    const updated = await withTenantSchema(tenantId, async (tdb) => {
      const [existing] = await tdb
        .select()
        .from(devices)
        .where(and(eq(devices.id, id), eq(devices.tenantId, tenantId)))
        .limit(1)

      if (!existing) return null

      request.auditBefore = { id: existing.id, name: existing.name, locationId: existing.locationId }

      const patch: Partial<typeof existing> = {}
      if (body.data.name !== undefined) patch.name = body.data.name
      if (body.data.locationId !== undefined) patch.locationId = body.data.locationId

      const [row] = await tdb
        .update(devices)
        .set(patch)
        .where(eq(devices.id, id))
        .returning()

      return row
    })

    if (!updated) {
      return reply.status(404).send({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' })
    }

    request.auditAfter = { id: updated.id, name: updated.name, locationId: updated.locationId }

    return reply.status(200).send(updated)
  })

  // ── DELETE /devices/:id ────────────────────────────────────────────────────
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await request.authenticate()
    await request.requirePermission('devices', 'write')

    const { tenantId, id: actorId } = request.user!
    const { id } = request.params

    const revoked = await withTenantSchema(tenantId, async (tdb) => {
      const [existing] = await tdb
        .select()
        .from(devices)
        .where(and(eq(devices.id, id), eq(devices.tenantId, tenantId)))
        .limit(1)

      if (!existing) return null

      request.auditBefore = { id: existing.id, status: existing.status }

      await tdb.update(devices).set({ status: 'revoked' }).where(eq(devices.id, id))

      await tdb.insert(deviceAccessLog).values({
        id: nanoid(),
        deviceId: id,
        userId: actorId,
        action: 'revoked',
        ipAddress: request.ip,
      })

      return true
    })

    if (!revoked) {
      return reply.status(404).send({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' })
    }

    request.auditAfter = { id, status: 'revoked' }

    return reply.status(200).send({ success: true })
  })

  // ── GET /devices/:id/access-log ────────────────────────────────────────────
  fastify.get(
    '/:id/access-log',
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: Record<string, string> }>, reply: FastifyReply) => {
      await request.authenticate()
      await request.requirePermission('devices', 'read')

      const query = accessLogQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: query.error.issues })
      }

      const { tenantId } = request.user!
      const { id } = request.params
      const { page, limit } = query.data
      const offset = (page - 1) * limit

      const result = await withTenantSchema(tenantId, async (tdb) => {
        // Verify device belongs to tenant
        const [device] = await tdb
          .select({ id: devices.id })
          .from(devices)
          .where(and(eq(devices.id, id), eq(devices.tenantId, tenantId)))
          .limit(1)

        if (!device) return null

        const log = await tdb
          .select()
          .from(deviceAccessLog)
          .where(eq(deviceAccessLog.deviceId, id))
          .orderBy(desc(deviceAccessLog.createdAt))
          .limit(limit)
          .offset(offset)

        return log
      })

      if (result === null) {
        return reply.status(404).send({ error: 'Device not found', code: 'DEVICE_NOT_FOUND' })
      }

      return reply.status(200).send({ log: result, page, limit })
    },
  )

  // ── POST /devices/:id/renew ────────────────────────────────────────────────
  fastify.post(
    '/:id/renew',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      await request.authenticate()
      await request.requirePermission('devices', 'write')

      const { tenantId, id: actorId } = request.user!
      const { id } = request.params

      // The client must still provide its current fingerprint for re-verification
      const body = z.object({ fingerprint: z.string().min(8) }).safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'Validation failed', issues: body.error.issues })
      }

      const result = await withTenantSchema(tenantId, async (tdb) => {
        const [device] = await tdb
          .select()
          .from(devices)
          .where(and(eq(devices.id, id), eq(devices.tenantId, tenantId)))
          .limit(1)

        if (!device) return { error: 'DEVICE_NOT_FOUND' } as const

        if (device.status !== 'active') {
          return { error: 'DEVICE_NOT_ACTIVE' } as const
        }

        // Verify the current certificate is still valid (not yet expired)
        // We allow renewal only while the cert is still cryptographically valid.
        // If it's already expired the device must be re-registered by an admin.
        try {
          jwt.verify(device.certificate, env.DEVICE_CERT_PUBLIC_KEY, { algorithms: ['RS256'] })
        } catch (err) {
          if (err instanceof jwt.TokenExpiredError) {
            return { error: 'CERT_ALREADY_EXPIRED' } as const
          }
          return { error: 'CERT_INVALID' } as const
        }

        // Recompute fingerprint hash from the provided fingerprint
        const newFph = fingerprintHash(body.data.fingerprint)

        // Verify fingerprint matches what's stored (drift check)
        if (newFph !== device.fingerprint) {
          // Mark device as drifted and refuse renewal
          await tdb
            .update(devices)
            .set({ status: 'fingerprint_drifted' })
            .where(eq(devices.id, id))

          await tdb.insert(deviceAccessLog).values({
            id: nanoid(),
            deviceId: id,
            userId: actorId,
            action: 'fingerprint_drift',
            ipAddress: request.ip,
          })

          return { error: 'FINGERPRINT_DRIFT' } as const
        }

        // Issue a new certificate
        const newCert = signDeviceCert({
          sub: device.id,
          tid: device.tenantId,
          lid: device.locationId,
          fph: newFph,
        })

        await tdb
          .update(devices)
          .set({ certificate: newCert })
          .where(eq(devices.id, id))

        await tdb.insert(deviceAccessLog).values({
          id: nanoid(),
          deviceId: id,
          userId: actorId,
          action: 'cert_renewed',
          ipAddress: request.ip,
        })

        return { certificate: newCert }
      })

      if ('error' in result) {
        const statusMap: Record<string, number> = {
          DEVICE_NOT_FOUND: 404,
          DEVICE_NOT_ACTIVE: 403,
          CERT_ALREADY_EXPIRED: 403,
          CERT_INVALID: 403,
          FINGERPRINT_DRIFT: 403,
        }
        const status = statusMap[result.error as keyof typeof statusMap] ?? 400
        return reply.status(status).send({ error: result.error, code: result.error })
      }

      request.auditAfter = { deviceId: id, action: 'cert_renewed' }

      return reply.status(200).send({ certificate: result.certificate })
    },
  )
}
