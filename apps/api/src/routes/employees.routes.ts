/**
 * routes/employees.routes.ts
 *
 * Employee management routes:
 *   GET    /employees                       — list employees
 *   POST   /employees                       — create employee
 *   GET    /employees/:id                   — get with role info
 *   PATCH  /employees/:id                   — update fields
 *   DELETE /employees/:id                   — soft delete (isActive = false)
 *   PATCH  /employees/:id/pin               — set / reset POS PIN (PBKDF2)
 *   GET    /employees/:id/time-entries      — list time entries (paginated)
 *   GET    /employees/:id/schedule          — upcoming schedule shifts
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import crypto from 'node:crypto'
import { eq, and, gte, lte, ilike, or, sql } from 'drizzle-orm'
import {
  employees,
  timeEntries,
  schedules,
  scheduleShifts,
  roles,
} from '@orderstack/db'
import { getTenantDb } from '../plugins/multitenancy.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Hash a PIN using PBKDF2-SHA256.
 * Returns a string in the format: `pbkdf2:sha256:<iterations>:<salt>:<hash>`
 * all fields base64url-encoded where appropriate.
 */
function hashPin(pin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const iterations = 310_000
    const salt = crypto.randomBytes(16)
    crypto.pbkdf2(pin, salt, iterations, 32, 'sha256', (err, derivedKey) => {
      if (err) return reject(err)
      const stored = [
        'pbkdf2',
        'sha256',
        String(iterations),
        salt.toString('base64url'),
        derivedKey.toString('base64url'),
      ].join(':')
      resolve(stored)
    })
  })
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listEmployeesQuery = z.object({
  locationId: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v !== 'false')
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const createEmployeeBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  employeeNumber: z.string().optional(),
  hireDate: z.string().optional(),
  payType: z.enum(['hourly', 'salary']).default('hourly'),
  payRate: z.number().finite().nonnegative().default(0),
  overtimeRate: z.number().finite().nonnegative().optional(),
  locationIds: z.array(z.string()).default([]),
  roleId: z.string().optional(),
})

const updateEmployeeBody = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  employeeNumber: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  terminationDate: z.string().nullable().optional(),
  payType: z.enum(['hourly', 'salary']).optional(),
  payRate: z.number().finite().nonnegative().optional(),
  overtimeRate: z.number().finite().nonnegative().nullable().optional(),
  locationIds: z.array(z.string()).optional(),
  roleId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

const setPinBody = z.object({
  pin: z
    .string()
    .regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
})

const listTimeEntriesQuery = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(['open', 'closed', 'approved']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const scheduleQuery = z.object({
  weekOf: z.string().optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function employeesRoutes(fastify: FastifyInstance) {
  // ── GET /employees ────────────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const query = listEmployeesQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { locationId, isActive, search, page, limit } = query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, (db) => {
      const conditions = [eq(employees.tenantId, request.user!.tenantId)]

      if (isActive !== undefined) {
        conditions.push(eq(employees.isActive, isActive))
      }

      if (locationId) {
        // locationIds is a JSONB array — use a JSON contains check
        conditions.push(
          sql`${employees.locationIds} @> ${JSON.stringify([locationId])}::jsonb`,
        )
      }

      if (search) {
        const pattern = `%${search}%`
        conditions.push(
          or(
            ilike(employees.firstName, pattern),
            ilike(employees.lastName, pattern),
            ilike(employees.email, pattern),
          )!,
        )
      }

      return db
        .select({
          id: employees.id,
          tenantId: employees.tenantId,
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          phone: employees.phone,
          hireDate: employees.hireDate,
          terminationDate: employees.terminationDate,
          payType: employees.payType,
          payRate: employees.payRate,
          overtimeRate: employees.overtimeRate,
          locationIds: employees.locationIds,
          roleId: employees.roleId,
          isActive: employees.isActive,
          createdAt: employees.createdAt,
          updatedAt: employees.updatedAt,
        })
        .from(employees)
        .where(and(...conditions))
        .orderBy(employees.lastName, employees.firstName)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── POST /employees ───────────────────────────────────────────────────────

  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createEmployeeBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const employee = await getTenantDb(request, async (db) => {
      const id = nanoid()

      await db.insert(employees).values({
        id,
        tenantId: request.user!.tenantId,
        firstName: body.data.firstName,
        lastName: body.data.lastName,
        email: body.data.email ?? null,
        phone: body.data.phone ?? null,
        employeeNumber: body.data.employeeNumber ?? null,
        hireDate: body.data.hireDate ? new Date(body.data.hireDate) : null,
        payType: body.data.payType,
        payRate: String(body.data.payRate),
        overtimeRate:
          body.data.overtimeRate !== undefined ? String(body.data.overtimeRate) : null,
        locationIds: body.data.locationIds,
        roleId: body.data.roleId ?? null,
        isActive: true,
      })

      const [created] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .limit(1)

      return created
    })

    return reply.status(201).send({ data: employee })
  })

  // ── GET /employees/:id ────────────────────────────────────────────────────

  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const result = await getTenantDb(request, async (db) => {
      const employeeRows = await db
        .select({
          id: employees.id,
          tenantId: employees.tenantId,
          userId: employees.userId,
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          phone: employees.phone,
          hireDate: employees.hireDate,
          terminationDate: employees.terminationDate,
          payType: employees.payType,
          payRate: employees.payRate,
          overtimeRate: employees.overtimeRate,
          locationIds: employees.locationIds,
          roleId: employees.roleId,
          isActive: employees.isActive,
          createdAt: employees.createdAt,
          updatedAt: employees.updatedAt,
        })
        .from(employees)
        .where(
          and(eq(employees.id, id), eq(employees.tenantId, request.user!.tenantId)),
        )
        .limit(1)

      if (employeeRows.length === 0) return null

      const employee = employeeRows[0]!

      let role: { id: string; name: string; description: string | null } | null = null

      if (employee.roleId) {
        const roleRows = await db
          .select({ id: roles.id, name: roles.name, description: roles.description })
          .from(roles)
          .where(eq(roles.id, employee.roleId))
          .limit(1)

        role = roleRows[0] ?? null
      }

      return { ...employee, role }
    })

    if (!result) {
      return reply.status(404).send({ error: 'Employee not found' })
    }

    return reply.send({ data: result })
  })

  // ── PATCH /employees/:id ──────────────────────────────────────────────────

  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = updateEmployeeBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const updated = await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
      }

      const d = body.data
      const updates: Record<string, unknown> = { updatedAt: new Date() }

      if (d.firstName !== undefined) updates.firstName = d.firstName
      if (d.lastName !== undefined) updates.lastName = d.lastName
      if (d.email !== undefined) updates.email = d.email
      if (d.phone !== undefined) updates.phone = d.phone
      if (d.employeeNumber !== undefined) updates.employeeNumber = d.employeeNumber
      if (d.hireDate !== undefined) updates.hireDate = d.hireDate ? new Date(d.hireDate) : null
      if (d.terminationDate !== undefined)
        updates.terminationDate = d.terminationDate ? new Date(d.terminationDate) : null
      if (d.payType !== undefined) updates.payType = d.payType
      if (d.payRate !== undefined) updates.payRate = String(d.payRate)
      if (d.overtimeRate !== undefined)
        updates.overtimeRate = d.overtimeRate !== null ? String(d.overtimeRate) : null
      if (d.locationIds !== undefined) updates.locationIds = d.locationIds
      if (d.roleId !== undefined) updates.roleId = d.roleId
      if (d.isActive !== undefined) updates.isActive = d.isActive

      const [row] = await db
        .update(employees)
        .set(updates)
        .where(eq(employees.id, id))
        .returning()

      return row
    })

    return reply.send({ data: updated })
  })

  // ── DELETE /employees/:id ─────────────────────────────────────────────────

  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
      }

      await db
        .update(employees)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(employees.id, id))
    })

    return reply.status(204).send()
  })

  // ── PATCH /employees/:id/pin ──────────────────────────────────────────────

  fastify.patch('/:id/pin', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = setPinBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
      }

      const pinHash = await hashPin(body.data.pin)

      await db
        .update(employees)
        .set({ pinHash, updatedAt: new Date() })
        .where(eq(employees.id, id))
    })

    return reply.send({ data: { message: 'PIN updated successfully' } })
  })

  // ── GET /employees/:id/time-entries ───────────────────────────────────────

  fastify.get('/:id/time-entries', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const query = listTimeEntriesQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { dateFrom, dateTo, status, page, limit } = query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, async (db) => {
      // Verify employee belongs to tenant
      const employeeRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.user!.tenantId)))
        .limit(1)

      if (employeeRows.length === 0) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
      }

      const conditions = [eq(timeEntries.employeeId, id)]

      if (status) conditions.push(eq(timeEntries.status, status))
      if (dateFrom) conditions.push(gte(timeEntries.clockIn, new Date(dateFrom)))
      if (dateTo) conditions.push(lte(timeEntries.clockIn, new Date(dateTo)))

      return db
        .select()
        .from(timeEntries)
        .where(and(...conditions))
        .orderBy(sql`${timeEntries.clockIn} DESC`)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── GET /employees/:id/schedule ───────────────────────────────────────────

  fastify.get('/:id/schedule', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const query = scheduleQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { weekOf } = query.data

    const shifts = await getTenantDb(request, async (db) => {
      // Verify employee belongs to tenant
      const employeeRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, id), eq(employees.tenantId, request.user!.tenantId)))
        .limit(1)

      if (employeeRows.length === 0) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
      }

      // Find schedules matching weekOf if provided, else all published schedules
      const scheduleConditions = [
        eq(schedules.tenantId, request.user!.tenantId),
        eq(schedules.status, 'published'),
      ]

      if (weekOf) {
        scheduleConditions.push(eq(schedules.weekStartDate, weekOf))
      }

      const matchedSchedules = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(and(...scheduleConditions))

      if (matchedSchedules.length === 0) {
        return []
      }

      const scheduleIds = matchedSchedules.map((s) => s.id)

      return db
        .select({
          id: scheduleShifts.id,
          scheduleId: scheduleShifts.scheduleId,
          employeeId: scheduleShifts.employeeId,
          roleId: scheduleShifts.roleId,
          startTime: scheduleShifts.startTime,
          endTime: scheduleShifts.endTime,
          breakMinutes: scheduleShifts.breakMinutes,
          notes: scheduleShifts.notes,
          status: scheduleShifts.status,
          weekStartDate: schedules.weekStartDate,
          locationId: schedules.locationId,
        })
        .from(scheduleShifts)
        .innerJoin(schedules, eq(scheduleShifts.scheduleId, schedules.id))
        .where(
          and(
            eq(scheduleShifts.employeeId, id),
            sql`${scheduleShifts.scheduleId} = ANY(ARRAY[${sql.join(
              scheduleIds.map((sid) => sql`${sid}`),
              sql`, `,
            )}])`,
          ),
        )
        .orderBy(scheduleShifts.startTime)
    })

    return reply.send({ data: shifts })
  })
}
