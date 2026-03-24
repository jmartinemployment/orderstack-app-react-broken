/**
 * routes/schedules.routes.ts
 *
 * Schedule management routes:
 *   GET    /schedules                       — list schedules (locationId required)
 *   POST   /schedules                       — create schedule
 *   PATCH  /schedules/:id                   — update notes
 *   POST   /schedules/:id/publish           — publish schedule
 *   GET    /schedules/:id/shifts            — list shifts with employee names
 *   POST   /schedules/:id/shifts            — add shift
 *   PATCH  /schedules/shifts/:shiftId       — update shift
 *   DELETE /schedules/shifts/:shiftId       — delete shift (draft only)
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import {
  schedules,
  scheduleShifts,
  employees,
} from '@orderstack/db'
import { getTenantDb } from '../plugins/multitenancy.js'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listSchedulesQuery = z.object({
  locationId: z.string().min(1),
  weekOf: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

const createScheduleBody = z.object({
  locationId: z.string().min(1),
  weekStartDate: z.string().min(1),
  notes: z.string().optional(),
})

const updateScheduleBody = z.object({
  notes: z.string().nullable().optional(),
})

const addShiftBody = z.object({
  employeeId: z.string().min(1),
  roleId: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  breakMinutes: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
})

const updateShiftBody = z.object({
  employeeId: z.string().optional(),
  roleId: z.string().nullable().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['scheduled', 'accepted', 'declined', 'swapped']).optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function schedulesRoutes(fastify: FastifyInstance) {
  // Shift sub-routes must be registered before /:id to avoid ambiguity.
  // Fastify 5 resolves static segments before parametric, but we keep
  // /shifts/:shiftId explicitly before /:id/shifts to be safe.

  // ── PATCH /schedules/shifts/:shiftId ─────────────────────────────────────

  fastify.patch('/shifts/:shiftId', async (request, reply) => {
    await request.authenticate()

    const { shiftId } = request.params as { shiftId: string }

    const body = updateShiftBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const updated = await getTenantDb(request, async (db) => {
      // Fetch shift and its parent schedule for tenant verification
      const shiftRows = await db
        .select({
          id: scheduleShifts.id,
          scheduleId: scheduleShifts.scheduleId,
        })
        .from(scheduleShifts)
        .where(eq(scheduleShifts.id, shiftId))
        .limit(1)

      if (shiftRows.length === 0) {
        throw Object.assign(new Error('Shift not found'), { statusCode: 404 })
      }

      const { scheduleId } = shiftRows[0]!

      const scheduleRows = await db
        .select({ tenantId: schedules.tenantId, status: schedules.status })
        .from(schedules)
        .where(eq(schedules.id, scheduleId))
        .limit(1)

      if (scheduleRows.length === 0 || scheduleRows[0]!.tenantId !== request.user!.tenantId) {
        throw Object.assign(new Error('Shift not found'), { statusCode: 404 })
      }

      const d = body.data
      const updates: Record<string, unknown> = {}

      if (d.employeeId !== undefined) updates.employeeId = d.employeeId
      if (d.roleId !== undefined) updates.roleId = d.roleId
      if (d.startTime !== undefined) updates.startTime = new Date(d.startTime)
      if (d.endTime !== undefined) updates.endTime = new Date(d.endTime)
      if (d.breakMinutes !== undefined) updates.breakMinutes = d.breakMinutes
      if (d.notes !== undefined) updates.notes = d.notes
      if (d.status !== undefined) updates.status = d.status

      const [row] = await db
        .update(scheduleShifts)
        .set(updates)
        .where(eq(scheduleShifts.id, shiftId))
        .returning()

      return row
    })

    return reply.send({ data: updated })
  })

  // ── DELETE /schedules/shifts/:shiftId ─────────────────────────────────────

  fastify.delete('/shifts/:shiftId', async (request, reply) => {
    await request.authenticate()

    const { shiftId } = request.params as { shiftId: string }

    await getTenantDb(request, async (db) => {
      const shiftRows = await db
        .select({ scheduleId: scheduleShifts.scheduleId })
        .from(scheduleShifts)
        .where(eq(scheduleShifts.id, shiftId))
        .limit(1)

      if (shiftRows.length === 0) {
        throw Object.assign(new Error('Shift not found'), { statusCode: 404 })
      }

      const { scheduleId } = shiftRows[0]!

      const scheduleRows = await db
        .select({ tenantId: schedules.tenantId, status: schedules.status })
        .from(schedules)
        .where(eq(schedules.id, scheduleId))
        .limit(1)

      if (scheduleRows.length === 0 || scheduleRows[0]!.tenantId !== request.user!.tenantId) {
        throw Object.assign(new Error('Shift not found'), { statusCode: 404 })
      }

      if (scheduleRows[0]!.status !== 'draft') {
        throw Object.assign(
          new Error('Shifts can only be deleted from draft schedules'),
          { statusCode: 409 },
        )
      }

      await db.delete(scheduleShifts).where(eq(scheduleShifts.id, shiftId))
    })

    return reply.status(204).send()
  })

  // ── GET /schedules ────────────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const query = listSchedulesQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { locationId, weekOf, status } = query.data

    const rows = await getTenantDb(request, (db) => {
      const conditions = [
        eq(schedules.tenantId, request.user!.tenantId),
        eq(schedules.locationId, locationId),
      ]

      if (weekOf) conditions.push(eq(schedules.weekStartDate, weekOf))
      if (status) conditions.push(eq(schedules.status, status))

      return db
        .select()
        .from(schedules)
        .where(and(...conditions))
        .orderBy(schedules.weekStartDate)
    })

    return reply.send({ data: rows })
  })

  // ── POST /schedules ───────────────────────────────────────────────────────

  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createScheduleBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const schedule = await getTenantDb(request, async (db) => {
      const id = nanoid()

      await db.insert(schedules).values({
        id,
        tenantId: request.user!.tenantId,
        locationId: body.data.locationId,
        weekStartDate: body.data.weekStartDate,
        status: 'draft',
        notes: body.data.notes ?? null,
      })

      const [created] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.id, id))
        .limit(1)

      return created
    })

    return reply.status(201).send({ data: schedule })
  })

  // ── PATCH /schedules/:id ──────────────────────────────────────────────────

  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = updateScheduleBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const updated = await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(and(eq(schedules.id, id), eq(schedules.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Schedule not found'), { statusCode: 404 })
      }

      const [row] = await db
        .update(schedules)
        .set({ notes: body.data.notes ?? null, updatedAt: new Date() })
        .where(eq(schedules.id, id))
        .returning()

      return row
    })

    return reply.send({ data: updated })
  })

  // ── POST /schedules/:id/publish ───────────────────────────────────────────

  fastify.post('/:id/publish', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const updated = await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ id: schedules.id, status: schedules.status })
        .from(schedules)
        .where(and(eq(schedules.id, id), eq(schedules.tenantId, request.user!.tenantId)))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Schedule not found'), { statusCode: 404 })
      }

      if (existing[0]!.status !== 'draft') {
        throw Object.assign(
          new Error('Only draft schedules can be published'),
          { statusCode: 409 },
        )
      }

      const now = new Date()

      const [row] = await db
        .update(schedules)
        .set({
          status: 'published',
          publishedAt: now,
          publishedBy: request.user!.id,
          updatedAt: now,
        })
        .where(eq(schedules.id, id))
        .returning()

      return row
    })

    return reply.send({ data: updated })
  })

  // ── GET /schedules/:id/shifts ─────────────────────────────────────────────

  fastify.get('/:id/shifts', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const shifts = await getTenantDb(request, async (db) => {
      const scheduleRows = await db
        .select({ id: schedules.id })
        .from(schedules)
        .where(and(eq(schedules.id, id), eq(schedules.tenantId, request.user!.tenantId)))
        .limit(1)

      if (scheduleRows.length === 0) {
        throw Object.assign(new Error('Schedule not found'), { statusCode: 404 })
      }

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
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
        })
        .from(scheduleShifts)
        .leftJoin(employees, eq(scheduleShifts.employeeId, employees.id))
        .where(eq(scheduleShifts.scheduleId, id))
        .orderBy(scheduleShifts.startTime)
    })

    return reply.send({ data: shifts })
  })

  // ── POST /schedules/:id/shifts ────────────────────────────────────────────

  fastify.post('/:id/shifts', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = addShiftBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const shift = await getTenantDb(request, async (db) => {
      const scheduleRows = await db
        .select({ id: schedules.id, status: schedules.status })
        .from(schedules)
        .where(and(eq(schedules.id, id), eq(schedules.tenantId, request.user!.tenantId)))
        .limit(1)

      if (scheduleRows.length === 0) {
        throw Object.assign(new Error('Schedule not found'), { statusCode: 404 })
      }

      if (scheduleRows[0]!.status === 'archived') {
        throw Object.assign(
          new Error('Cannot add shifts to an archived schedule'),
          { statusCode: 409 },
        )
      }

      // Verify employee belongs to tenant
      const employeeRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.id, body.data.employeeId),
            eq(employees.tenantId, request.user!.tenantId),
          ),
        )
        .limit(1)

      if (employeeRows.length === 0) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
      }

      const shiftId = nanoid()

      await db.insert(scheduleShifts).values({
        id: shiftId,
        scheduleId: id,
        employeeId: body.data.employeeId,
        roleId: body.data.roleId ?? null,
        startTime: new Date(body.data.startTime),
        endTime: new Date(body.data.endTime),
        breakMinutes: body.data.breakMinutes,
        notes: body.data.notes ?? null,
        status: 'scheduled',
      })

      const [created] = await db
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
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
        })
        .from(scheduleShifts)
        .leftJoin(employees, eq(scheduleShifts.employeeId, employees.id))
        .where(eq(scheduleShifts.id, shiftId))
        .limit(1)

      return created
    })

    return reply.status(201).send({ data: shift })
  })
}
