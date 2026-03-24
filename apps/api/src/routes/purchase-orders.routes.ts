/**
 * routes/purchase-orders.routes.ts
 *
 * Purchase order management routes:
 *   GET    /purchase-orders           — list POs
 *   POST   /purchase-orders           — create PO
 *   GET    /purchase-orders/:id       — get PO with items and vendor
 *   PATCH  /purchase-orders/:id       — update PO (draft only)
 *   DELETE /purchase-orders/:id       — cancel PO (draft only)
 *   POST   /purchase-orders/:id/receive — receive items
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, sql } from 'drizzle-orm'
import {
  purchaseOrders,
  purchaseOrderItems,
  vendors,
  inventoryLevels,
  inventoryAdjustments,
} from '@orderstack/db'
import { getTenantDb } from '../plugins/multitenancy.js'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const poStatusSchema = z.enum([
  'draft',
  'sent',
  'partially_received',
  'received',
  'cancelled',
])

const listPOsQuery = z.object({
  vendorId: z.string().optional(),
  status: poStatusSchema.optional(),
  locationId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
})

const createPOBody = z.object({
  locationId: z.string().min(1),
  vendorId: z.string().min(1),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1),
        quantityOrdered: z.number().finite().positive(),
        unitCost: z.number().finite().nonnegative(),
      }),
    )
    .min(1),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
})

const updatePOBody = z.object({
  vendorId: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['sent']).optional(),
})

const receiveItemsBody = z.object({
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().min(1),
        quantityReceived: z.number().finite().nonnegative(),
      }),
    )
    .min(1),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function purchaseOrdersRoutes(fastify: FastifyInstance) {
  // ── GET /purchase-orders ──────────────────────────────────────────────────

  fastify.get('/', async (request, reply) => {
    await request.authenticate()

    const query = listPOsQuery.safeParse(request.query)
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() })
    }

    const { vendorId, status, locationId, page, limit } = query.data
    const offset = (page - 1) * limit

    const rows = await getTenantDb(request, async (db) => {
      const conditions = []
      if (vendorId) conditions.push(eq(purchaseOrders.vendorId, vendorId))
      if (status) conditions.push(eq(purchaseOrders.status, status))
      if (locationId) conditions.push(eq(purchaseOrders.locationId, locationId))

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      return db
        .select({
          id: purchaseOrders.id,
          tenantId: purchaseOrders.tenantId,
          locationId: purchaseOrders.locationId,
          vendorId: purchaseOrders.vendorId,
          status: purchaseOrders.status,
          expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
          notes: purchaseOrders.notes,
          totalCost: purchaseOrders.totalCost,
          createdBy: purchaseOrders.createdBy,
          createdAt: purchaseOrders.createdAt,
          updatedAt: purchaseOrders.updatedAt,
          vendorName: vendors.name,
        })
        .from(purchaseOrders)
        .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
        .where(whereClause)
        .orderBy(sql`${purchaseOrders.createdAt} DESC`)
        .limit(limit)
        .offset(offset)
    })

    return reply.send({
      data: rows,
      pagination: { page, limit, total: rows.length },
    })
  })

  // ── POST /purchase-orders ─────────────────────────────────────────────────

  fastify.post('/', async (request, reply) => {
    await request.authenticate()

    const body = createPOBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { locationId, vendorId, items, expectedDeliveryDate, notes } = body.data

    const po = await getTenantDb(request, async (db) => {
      // Verify vendor exists
      const vendorRows = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.id, vendorId), eq(vendors.isActive, true)))
        .limit(1)

      if (vendorRows.length === 0) {
        throw Object.assign(new Error('Vendor not found'), { statusCode: 404 })
      }

      const poId = nanoid()
      const totalCost = items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0)

      await db.insert(purchaseOrders).values({
        id: poId,
        tenantId: request.user!.tenantId,
        locationId,
        vendorId,
        status: 'draft',
        expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
        notes: notes ?? null,
        totalCost: String(totalCost),
        createdBy: request.user!.id,
      })

      for (const item of items) {
        await db.insert(purchaseOrderItems).values({
          id: nanoid(),
          purchaseOrderId: poId,
          inventoryItemId: item.inventoryItemId,
          quantityOrdered: String(item.quantityOrdered),
          quantityReceived: '0',
          unitCost: String(item.unitCost),
        })
      }

      const [createdPo] = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1)

      const poItems = await db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, poId))

      return { ...createdPo, items: poItems }
    })

    return reply.status(201).send({ data: po })
  })

  // ── GET /purchase-orders/:id ──────────────────────────────────────────────

  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const result = await getTenantDb(request, async (db) => {
      const poRows = await db
        .select({
          id: purchaseOrders.id,
          tenantId: purchaseOrders.tenantId,
          locationId: purchaseOrders.locationId,
          vendorId: purchaseOrders.vendorId,
          status: purchaseOrders.status,
          expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
          notes: purchaseOrders.notes,
          totalCost: purchaseOrders.totalCost,
          createdBy: purchaseOrders.createdBy,
          createdAt: purchaseOrders.createdAt,
          updatedAt: purchaseOrders.updatedAt,
          vendorName: vendors.name,
          vendorContactName: vendors.contactName,
          vendorEmail: vendors.email,
          vendorPhone: vendors.phone,
        })
        .from(purchaseOrders)
        .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
        .where(eq(purchaseOrders.id, id))
        .limit(1)

      if (poRows.length === 0) return null

      const items = await db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, id))

      return { ...poRows[0]!, items }
    })

    if (!result) {
      return reply.status(404).send({ error: 'Purchase order not found' })
    }

    return reply.send({ data: result })
  })

  // ── PATCH /purchase-orders/:id ────────────────────────────────────────────

  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = updatePOBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const result = await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 })
      }

      if (existing[0]!.status !== 'draft') {
        throw Object.assign(
          new Error('Only draft purchase orders can be updated'),
          { statusCode: 409 },
        )
      }

      const { vendorId, expectedDeliveryDate, notes, status } = body.data
      const updates: Record<string, unknown> = { updatedAt: new Date() }

      if (vendorId !== undefined) updates.vendorId = vendorId
      if (expectedDeliveryDate !== undefined)
        updates.expectedDeliveryDate = new Date(expectedDeliveryDate)
      if (notes !== undefined) updates.notes = notes
      if (status !== undefined) updates.status = status

      const [updated] = await db
        .update(purchaseOrders)
        .set(updates)
        .where(eq(purchaseOrders.id, id))
        .returning()

      return updated
    })

    return reply.send({ data: result })
  })

  // ── DELETE /purchase-orders/:id ───────────────────────────────────────────

  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    await getTenantDb(request, async (db) => {
      const existing = await db
        .select({ status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1)

      if (existing.length === 0) {
        throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 })
      }

      if (existing[0]!.status !== 'draft') {
        throw Object.assign(
          new Error('Only draft purchase orders can be cancelled'),
          { statusCode: 409 },
        )
      }

      await db
        .update(purchaseOrders)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
    })

    return reply.status(204).send()
  })

  // ── POST /purchase-orders/:id/receive ─────────────────────────────────────

  fastify.post('/:id/receive', async (request, reply) => {
    await request.authenticate()

    const { id } = request.params as { id: string }

    const body = receiveItemsBody.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { items } = body.data

    const result = await getTenantDb(request, async (db) => {
      const poRows = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1)

      if (poRows.length === 0) {
        throw Object.assign(new Error('Purchase order not found'), { statusCode: 404 })
      }

      const po = poRows[0]!

      if (po.status === 'cancelled' || po.status === 'received') {
        throw Object.assign(
          new Error(`Cannot receive items for a ${po.status} purchase order`),
          { statusCode: 409 },
        )
      }

      for (const receiveItem of items) {
        const itemRows = await db
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.id, receiveItem.purchaseOrderItemId))
          .limit(1)

        if (itemRows.length === 0) continue

        const poItem = itemRows[0]!

        if (poItem.purchaseOrderId !== id) {
          throw Object.assign(
            new Error(`Item ${receiveItem.purchaseOrderItemId} does not belong to this PO`),
            { statusCode: 400 },
          )
        }

        const newQuantityReceived =
          parseFloat(poItem.quantityReceived ?? '0') + receiveItem.quantityReceived

        await db
          .update(purchaseOrderItems)
          .set({ quantityReceived: String(newQuantityReceived) })
          .where(eq(purchaseOrderItems.id, receiveItem.purchaseOrderItemId))

        if (receiveItem.quantityReceived > 0) {
          // Credit inventory at the PO's location
          const destLevelRows = await db
            .select()
            .from(inventoryLevels)
            .where(
              and(
                eq(inventoryLevels.inventoryItemId, poItem.inventoryItemId),
                eq(inventoryLevels.locationId, po.locationId),
              ),
            )
            .limit(1)

          if (destLevelRows.length === 0) {
            await db.insert(inventoryLevels).values({
              id: nanoid(),
              inventoryItemId: poItem.inventoryItemId,
              locationId: po.locationId,
              quantityOnHand: String(receiveItem.quantityReceived),
              quantityCommitted: '0',
              quantityAvailable: String(receiveItem.quantityReceived),
            })
          } else {
            await db
              .update(inventoryLevels)
              .set({
                quantityOnHand: sql`quantity_on_hand + ${String(receiveItem.quantityReceived)}`,
                quantityAvailable: sql`quantity_available + ${String(receiveItem.quantityReceived)}`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(inventoryLevels.inventoryItemId, poItem.inventoryItemId),
                  eq(inventoryLevels.locationId, po.locationId),
                ),
              )
          }

          await db.insert(inventoryAdjustments).values({
            id: nanoid(),
            inventoryItemId: poItem.inventoryItemId,
            locationId: po.locationId,
            adjustmentType: 'receive',
            quantityDelta: String(receiveItem.quantityReceived),
            notes: `Received against PO ${id}`,
            referenceId: id,
            referenceType: 'purchase_order',
            createdBy: request.user!.id,
          })
        }
      }

      // Determine new PO status based on received quantities
      const allItems = await db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, id))

      const allFullyReceived = allItems.every(
        (item) =>
          parseFloat(item.quantityReceived ?? '0') >= parseFloat(item.quantityOrdered),
      )
      const anyReceived = allItems.some(
        (item) => parseFloat(item.quantityReceived ?? '0') > 0,
      )

      const newStatus = allFullyReceived
        ? 'received'
        : anyReceived
          ? 'partially_received'
          : po.status

      if (newStatus !== po.status) {
        await db
          .update(purchaseOrders)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(purchaseOrders.id, id))
      }

      const [updatedPo] = await db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .limit(1)

      const updatedItems = await db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.purchaseOrderId, id))

      return { ...updatedPo, items: updatedItems }
    })

    return reply.send({ data: result })
  })
}
