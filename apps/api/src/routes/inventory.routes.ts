/**
 * routes/inventory.routes.ts
 *
 * Inventory management routes:
 *   GET    /inventory                    — levels by location
 *   POST   /inventory/adjustments        — manual adjustment
 *   GET    /inventory/adjustments        — list adjustments
 *   POST   /inventory/counts             — start count session
 *   PATCH  /inventory/counts/:id         — submit count results
 *   POST   /inventory/transfers          — create stock transfer
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import {
  inventoryItems,
  inventoryLevels,
  inventoryAdjustments,
  stockTransfers,
  stockTransferItems,
} from '@orderstack/db'
import { getTenantDb } from '../plugins/multitenancy.js'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const adjustmentTypeSchema = z.enum([
  'sale',
  'return',
  'waste',
  'receive',
  'transfer',
  'count',
  'manual',
])

const createAdjustmentBody = z.object({
  inventoryItemId: z.string().min(1),
  locationId: z.string().min(1),
  adjustmentType: adjustmentTypeSchema,
  quantityDelta: z.number().finite(),
  notes: z.string().optional(),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
})

const listAdjustmentsQuery = z.object({
  inventoryItemId: z.string().optional(),
  locationId: z.string().optional(),
  adjustmentType: adjustmentTypeSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const startCountBody = z.object({
  locationId: z.string().min(1),
  inventoryItemIds: z.array(z.string().min(1)).optional(),
})

const submitCountBody = z.object({
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        actualCount: z.number().finite().nonnegative(),
      }),
    )
    .min(1),
})

const createTransferBody = z.object({
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        quantity: z.number().finite().positive(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function inventoryRoutes(fastify: FastifyInstance) {
  // ── GET /inventory ────────────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const querySchema = z.object({
      locationId: z.string().min(1),
    })

    const query = querySchema.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: 'locationId query parameter is required' })
    }

    const { locationId } = query.data

    const rows = await getTenantDb(request, (db) =>
      db
        .select({
          id: inventoryLevels.id,
          inventoryItemId: inventoryLevels.inventoryItemId,
          locationId: inventoryLevels.locationId,
          quantityOnHand: inventoryLevels.quantityOnHand,
          quantityCommitted: inventoryLevels.quantityCommitted,
          quantityAvailable: inventoryLevels.quantityAvailable,
          reorderPoint: inventoryItems.reorderPoint,
          unitOfMeasure: inventoryItems.unitOfMeasure,
          productVariantId: inventoryItems.productVariantId,
          updatedAt: inventoryLevels.updatedAt,
        })
        .from(inventoryLevels)
        .innerJoin(inventoryItems, eq(inventoryLevels.inventoryItemId, inventoryItems.id))
        .where(eq(inventoryLevels.locationId, locationId)),
    )

    const data = rows.map((row) => {
      const qoh = parseFloat(row.quantityOnHand ?? '0')
      const reorderPt = row.reorderPoint != null ? parseFloat(row.reorderPoint) : null
      return {
        ...row,
        quantityOnHand: qoh,
        quantityCommitted: parseFloat(row.quantityCommitted ?? '0'),
        quantityAvailable: parseFloat(row.quantityAvailable ?? '0'),
        reorderPoint: reorderPt,
        isLowStock: reorderPt !== null ? qoh <= reorderPt : false,
      }
    })

    return reply.send({ data })
  })

  // ── POST /inventory/adjustments ───────────────────────────────────────────

  fastify.post('/adjustments', async (request, reply) => {
    await request.authenticate()

    const body = createAdjustmentBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const {
      inventoryItemId,
      locationId,
      adjustmentType,
      quantityDelta,
      notes,
      referenceId,
      referenceType,
    } = body.data

    const result = await getTenantDb(request, async (db) => {
      const adjustmentId = nanoid()

      await db.insert(inventoryAdjustments).values({
        id: adjustmentId,
        inventoryItemId,
        locationId,
        adjustmentType,
        quantityDelta: String(quantityDelta),
        notes: notes ?? null,
        referenceId: referenceId ?? null,
        referenceType: referenceType ?? null,
        createdBy: request.user!.id,
      })

      // Upsert inventory level — update quantityOnHand, recompute quantityAvailable
      const existing = await db
        .select()
        .from(inventoryLevels)
        .where(
          and(
            eq(inventoryLevels.inventoryItemId, inventoryItemId),
            eq(inventoryLevels.locationId, locationId),
          ),
        )
        .limit(1)

      if (existing.length === 0) {
        const newQoh = quantityDelta
        await db.insert(inventoryLevels).values({
          id: nanoid(),
          inventoryItemId,
          locationId,
          quantityOnHand: String(newQoh),
          quantityCommitted: '0',
          quantityAvailable: String(Math.max(0, newQoh)),
        })
      } else {
        await db
          .update(inventoryLevels)
          .set({
            quantityOnHand: sql`quantity_on_hand + ${String(quantityDelta)}`,
            quantityAvailable: sql`GREATEST(0, quantity_available + ${String(quantityDelta)})`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryLevels.inventoryItemId, inventoryItemId),
              eq(inventoryLevels.locationId, locationId),
            ),
          )
      }

      const [adjustment] = await db
        .select()
        .from(inventoryAdjustments)
        .where(eq(inventoryAdjustments.id, adjustmentId))
        .limit(1)

      return adjustment
    })

    return reply.status(201).send({ data: result })
  })

  // ── GET /inventory/adjustments ────────────────────────────────────────────

  fastify.get('/adjustments', async (request, reply) => {
    await request.authenticate()

    const query = listAdjustmentsQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { inventoryItemId, locationId, adjustmentType, dateFrom, dateTo, page, limit } =
      query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, (db) => {
      const conditions = []
      if (inventoryItemId) conditions.push(eq(inventoryAdjustments.inventoryItemId, inventoryItemId))
      if (locationId) conditions.push(eq(inventoryAdjustments.locationId, locationId))
      if (adjustmentType) conditions.push(eq(inventoryAdjustments.adjustmentType, adjustmentType))
      if (dateFrom) conditions.push(gte(inventoryAdjustments.createdAt, new Date(dateFrom)))
      if (dateTo) conditions.push(lte(inventoryAdjustments.createdAt, new Date(dateTo)))

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      return db
        .select()
        .from(inventoryAdjustments)
        .where(whereClause)
        .orderBy(sql`${inventoryAdjustments.createdAt} DESC`)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── POST /inventory/counts ────────────────────────────────────────────────

  fastify.post('/counts', async (request, reply) => {
    await request.authenticate()

    const body = startCountBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { locationId, inventoryItemIds } = body.data

    const sessionItems = await getTenantDb(request, async (db) => {
      let levelsQuery = db
        .select({
          inventoryItemId: inventoryLevels.inventoryItemId,
          locationId: inventoryLevels.locationId,
          quantityOnHand: inventoryLevels.quantityOnHand,
          unitOfMeasure: inventoryItems.unitOfMeasure,
          productVariantId: inventoryItems.productVariantId,
        })
        .from(inventoryLevels)
        .innerJoin(inventoryItems, eq(inventoryLevels.inventoryItemId, inventoryItems.id))
        .where(eq(inventoryLevels.locationId, locationId))

      const rows = await levelsQuery

      if (inventoryItemIds && inventoryItemIds.length > 0) {
        return rows.filter((r) => inventoryItemIds.includes(r.inventoryItemId))
      }

      return rows
    })

    const sessionId = nanoid()
    const now = new Date().toISOString()

    return reply.status(201).send({
      data: {
        id: sessionId,
        locationId,
        status: 'open',
        startedAt: now,
        startedBy: request.user!.id,
        items: sessionItems.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          productVariantId: item.productVariantId,
          unitOfMeasure: item.unitOfMeasure,
          expectedQuantity: parseFloat(item.quantityOnHand ?? '0'),
          actualCount: null,
        })),
      },
    })
  })

  // ── PATCH /inventory/counts/:id ───────────────────────────────────────────

  fastify.patch('/counts/:id', async (request, reply) => {
    await request.authenticate()

    const { id: sessionId } = request.params as { id: string }

    const body = submitCountBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { items } = body.data

    // Fetch the current on-hand quantities to compute variance, then insert
    // one COUNT adjustment per item where there is a variance
    const adjustments = await getTenantDb(request, async (db) => {
      const created: Array<{ inventoryItemId: string; variance: number; adjustmentId: string }> = []

      for (const item of items) {
        // Resolve the location from inventory level — we need one to exist already
        const levelRows = await db
          .select({
            locationId: inventoryLevels.locationId,
            quantityOnHand: inventoryLevels.quantityOnHand,
          })
          .from(inventoryLevels)
          .where(eq(inventoryLevels.inventoryItemId, item.inventoryItemId))
          .limit(1)

        if (levelRows.length === 0) continue

        const { locationId, quantityOnHand } = levelRows[0]!
        const currentQoh = parseFloat(quantityOnHand ?? '0')
        const variance = item.actualCount - currentQoh

        // Only record an adjustment if there is a variance
        if (variance !== 0) {
          const adjustmentId = nanoid()

          await db.insert(inventoryAdjustments).values({
            id: adjustmentId,
            inventoryItemId: item.inventoryItemId,
            locationId,
            adjustmentType: 'count',
            quantityDelta: String(variance),
            notes: `Count session ${sessionId}`,
            referenceId: sessionId,
            referenceType: 'count_session',
            createdBy: request.user!.id,
          })

          // Update inventory level
          await db
            .update(inventoryLevels)
            .set({
              quantityOnHand: String(item.actualCount),
              quantityAvailable: sql`GREATEST(0, quantity_available + ${String(variance)})`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(inventoryLevels.inventoryItemId, item.inventoryItemId),
                eq(inventoryLevels.locationId, locationId),
              ),
            )

          created.push({ inventoryItemId: item.inventoryItemId, variance, adjustmentId })
        }
      }

      return created
    })

    return reply.send({
      data: {
        id: sessionId,
        status: 'complete',
        completedAt: new Date().toISOString(),
        completedBy: request.user!.id,
        adjustmentsCreated: adjustments.length,
        adjustments,
      },
    })
  })

  // ── POST /inventory/transfers ─────────────────────────────────────────────

  fastify.post('/transfers', async (request, reply) => {
    await request.authenticate()

    const body = createTransferBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { fromLocationId, toLocationId, items, notes } = body.data

    if (fromLocationId === toLocationId) {
      return reply.status(400).send({ error: 'fromLocationId and toLocationId must differ' })
    }

    const transfer = await getTenantDb(request, async (db) => {
      const transferId = nanoid()

      await db.insert(stockTransfers).values({
        id: transferId,
        tenantId: request.user!.tenantId,
        fromLocationId,
        toLocationId,
        status: 'pending',
        initiatedBy: request.user!.id,
        notes: notes ?? null,
      })

      for (const item of items) {
        await db.insert(stockTransferItems).values({
          id: nanoid(),
          transferId,
          inventoryItemId: item.inventoryItemId,
          quantityRequested: String(item.quantity),
          quantityTransferred: '0',
        })

        // Debit from source location
        await db
          .update(inventoryLevels)
          .set({
            quantityOnHand: sql`quantity_on_hand - ${String(item.quantity)}`,
            quantityAvailable: sql`GREATEST(0, quantity_available - ${String(item.quantity)})`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryLevels.inventoryItemId, item.inventoryItemId),
              eq(inventoryLevels.locationId, fromLocationId),
            ),
          )

        await db.insert(inventoryAdjustments).values({
          id: nanoid(),
          inventoryItemId: item.inventoryItemId,
          locationId: fromLocationId,
          adjustmentType: 'transfer',
          quantityDelta: String(-item.quantity),
          notes: `Transfer to ${toLocationId}`,
          referenceId: transferId,
          referenceType: 'stock_transfer',
          createdBy: request.user!.id,
        })

        // Credit to destination location
        const destLevelRows = await db
          .select()
          .from(inventoryLevels)
          .where(
            and(
              eq(inventoryLevels.inventoryItemId, item.inventoryItemId),
              eq(inventoryLevels.locationId, toLocationId),
            ),
          )
          .limit(1)

        if (destLevelRows.length === 0) {
          await db.insert(inventoryLevels).values({
            id: nanoid(),
            inventoryItemId: item.inventoryItemId,
            locationId: toLocationId,
            quantityOnHand: String(item.quantity),
            quantityCommitted: '0',
            quantityAvailable: String(item.quantity),
          })
        } else {
          await db
            .update(inventoryLevels)
            .set({
              quantityOnHand: sql`quantity_on_hand + ${String(item.quantity)}`,
              quantityAvailable: sql`quantity_available + ${String(item.quantity)}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(inventoryLevels.inventoryItemId, item.inventoryItemId),
                eq(inventoryLevels.locationId, toLocationId),
              ),
            )
        }

        await db.insert(inventoryAdjustments).values({
          id: nanoid(),
          inventoryItemId: item.inventoryItemId,
          locationId: toLocationId,
          adjustmentType: 'transfer',
          quantityDelta: String(item.quantity),
          notes: `Transfer from ${fromLocationId}`,
          referenceId: transferId,
          referenceType: 'stock_transfer',
          createdBy: request.user!.id,
        })
      }

      const [created] = await db
        .select()
        .from(stockTransfers)
        .where(eq(stockTransfers.id, transferId))
        .limit(1)

      const transferItemRows = await db
        .select()
        .from(stockTransferItems)
        .where(eq(stockTransferItems.transferId, transferId))

      return { ...created, items: transferItemRows }
    })

    return reply.status(201).send({ data: transfer })
  })
}
