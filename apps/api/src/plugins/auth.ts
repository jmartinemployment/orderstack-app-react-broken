/**
 * plugins/auth.ts
 *
 * Configures Better Auth, attaches `request.authenticate()` and
 * `request.requirePermission()` decorators, and exports the betterAuth
 * instance for use by auth route handlers.
 *
 * Registered in app.ts via: await app.register(authPlugin)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import jwt from 'jsonwebtoken'
import { eq, and } from 'drizzle-orm'
import {
  db,
  withTenantSchema,
  baUser,
  baSession,
  baAccount,
  baVerification,
  users,
  permissions,
  rolePermissions,
  userRoles,
} from '@orderstack/db'
import { env } from '../config/env.js'

// ─── Better Auth instance (exported for route handlers) ──────────────────────

export const auth = betterAuth({
  secret: env.JWT_SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: baUser,
      session: baSession,
      account: baAccount,
      verification: baVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // refresh if older than 1 day
  },
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  /** Tenant-schema users.id */
  id: string
  tenantId: string
  /** public.ba_user.id */
  baUserId: string
  email: string
}

interface JwtPayload {
  sub: string        // ba_user.id
  tenant_id: string
  user_id: string    // tenant-schema users.id
  email: string
  iat: number
  exp: number
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Decoded and verified auth payload. Undefined for unauthenticated routes. */
    user?: AuthUser
    /** Verifies Bearer JWT and populates request.user. Throws 401 on failure. */
    authenticate(): Promise<void>
    /** Verifies user has the given permission. Throws 403 on failure. */
    requirePermission(resource: string, action: string): Promise<void>
    /** Snapshots attached by route handlers for audit logging */
    auditBefore?: unknown
    auditAfter?: unknown
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('user', undefined)
  fastify.decorateRequest('auditBefore', undefined)
  fastify.decorateRequest('auditAfter', undefined)

  // ── authenticate ──────────────────────────────────────────────────────────
  fastify.decorateRequest('authenticate', async function (this: FastifyRequest) {
    const authHeader = this.headers['authorization']
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw Object.assign(new Error('Missing or malformed Authorization header'), {
        statusCode: 401,
        code: 'MISSING_AUTH_HEADER',
      })
    }

    const token = authHeader.slice(7)

    let payload: JwtPayload
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
      }) as JwtPayload
    } catch (err) {
      const code = err instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
      const message = err instanceof jwt.TokenExpiredError ? 'Token expired' : 'Invalid token'
      throw Object.assign(new Error(message), { statusCode: 401, code })
    }

    if (!payload.tenant_id || !payload.user_id) {
      throw Object.assign(new Error('Token missing required claims'), {
        statusCode: 401,
        code: 'TOKEN_CLAIMS_MISSING',
      })
    }

    this.user = {
      id: payload.user_id,
      tenantId: payload.tenant_id,
      baUserId: payload.sub,
      email: payload.email,
    }
  })

  // ── requirePermission ─────────────────────────────────────────────────────
  fastify.decorateRequest(
    'requirePermission',
    async function (this: FastifyRequest, resource: string, action: string) {
      if (!this.user) {
        throw Object.assign(new Error('Unauthenticated'), { statusCode: 401, code: 'UNAUTHENTICATED' })
      }

      const { id: userId, tenantId } = this.user

      const hasPermission = await withTenantSchema(tenantId, async (tdb) => {
        const rows = await tdb
          .select({ permissionId: permissions.id })
          .from(userRoles)
          .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(
            and(
              eq(userRoles.userId, userId),
              eq(permissions.resource, resource),
              eq(permissions.action, action),
            ),
          )
          .limit(1)

        return rows.length > 0
      })

      if (!hasPermission) {
        throw Object.assign(new Error(`Permission denied: ${resource}:${action}`), {
          statusCode: 403,
          code: 'PERMISSION_DENIED',
        })
      }
    },
  )
}
