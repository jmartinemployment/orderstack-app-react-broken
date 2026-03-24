import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, inArray } from 'drizzle-orm'
import { menus, menuItems, menuLocations, products } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const menuTypeValues = ['dine_in', 'takeout', 'delivery', 'online'] as const

const createMenuBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(menuTypeValues).optional().default('dine_in'),
})

const updateMenuBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(menuTypeValues).optional(),
})

const addMenuItemBody = z.object({
  productId: z.string().min(1),
  priceOverride: z.number().nonnegative().nullable().optional(),
  isAvailable: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  availableFrom: z.string().optional(),
  availableUntil: z.string().optional(),
  availableDays: z.array(z.number().int().min(0).max(6)).optional(),
})

const updateMenuItemBody = z.object({
  priceOverride: z.number().nonnegative().nullable().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  availableFrom: z.string().nullable().optional(),
  availableUntil: z.string().nullable().optional(),
  availableDays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
})

const publishMenuBody = z.object({
  locationIds: z.array(z.string().min(1)).min(1),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const menusRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /menus
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const rows = await db
      .select()
      .from(menus)
      .where(eq(menus.tenantId, request.user!.tenantId))
      .orderBy(menus.name)

    return reply.send({ data: rows })
  })

  // POST /menus
  fastify.post('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createMenuBody.parse(request.body)
    const id = nanoid()
    const now = new Date()

    await db.insert(menus).values({
      id,
      tenantId: request.user!.tenantId,
      name: body.name,
      description: body.description ?? null,
      type: body.type,
      createdAt: now,
      updatedAt: now,
    })

    const [menu] = await db.select().from(menus).where(eq(menus.id, id))

    return reply.status(201).send(menu)
  })

  // GET /menus/:id — with items and location assignments
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [menu] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!menu) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    const [items, locations] = await Promise.all([
      db
        .select({
          menuItem: menuItems,
          product: {
            id: products.id,
            name: products.name,
            description: products.description,
            imageUrl: products.imageUrl,
            productType: products.productType,
            isActive: products.isActive,
          },
        })
        .from(menuItems)
        .innerJoin(products, eq(menuItems.productId, products.id))
        .where(eq(menuItems.menuId, id))
        .orderBy(menuItems.sortOrder),
      db.select().from(menuLocations).where(eq(menuLocations.menuId, id)),
    ])

    return reply.send({
      ...menu,
      items: items.map((r) => ({ ...r.menuItem, product: r.product })),
      locations,
    })
  })

  // PATCH /menus/:id
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateMenuBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.type !== undefined) updateData.type = body.type

    const [updated] = await db
      .update(menus)
      .set(updateData)
      .where(eq(menus.id, id))
      .returning()

    return reply.send(updated)
  })

  // DELETE /menus/:id
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [existing] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    // Cascade handled by DB (menuItems, menuLocations onDelete: cascade)
    await db.delete(menus).where(eq(menus.id, id))

    return reply.status(204).send()
  })

  // POST /menus/:id/items
  fastify.post('/:id/items', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = addMenuItemBody.parse(request.body)

    const [menu] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!menu) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    const [product] = await db.select().from(products).where(eq(products.id, body.productId))

    if (!product) {
      return reply.status(400).send({ error: 'Product not found' })
    }

    const itemId = nanoid()

    await db.insert(menuItems).values({
      id: itemId,
      menuId: id,
      productId: body.productId,
      priceOverride: body.priceOverride != null ? String(body.priceOverride) : null,
      isAvailable: body.isAvailable ?? true,
      sortOrder: body.sortOrder ?? 0,
      availableFrom: body.availableFrom ?? null,
      availableUntil: body.availableUntil ?? null,
      availableDays: body.availableDays ?? null,
    })

    const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId))

    return reply.status(201).send(item)
  })

  // PATCH /menus/:id/items/:itemId
  fastify.patch('/:id/items/:itemId', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id, itemId } = request.params as { id: string; itemId: string }
    const body = updateMenuItemBody.parse(request.body)

    // Verify menu ownership
    const [menu] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!menu) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    const [existingItem] = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.id, itemId), eq(menuItems.menuId, id)))

    if (!existingItem) {
      return reply.status(404).send({ error: 'Menu item not found' })
    }

    const updateData: Record<string, unknown> = {}

    if (body.priceOverride !== undefined)
      updateData.priceOverride = body.priceOverride != null ? String(body.priceOverride) : null
    if (body.isAvailable !== undefined) updateData.isAvailable = body.isAvailable
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder
    if (body.availableFrom !== undefined) updateData.availableFrom = body.availableFrom
    if (body.availableUntil !== undefined) updateData.availableUntil = body.availableUntil
    if (body.availableDays !== undefined) updateData.availableDays = body.availableDays

    const [updated] = await db
      .update(menuItems)
      .set(updateData)
      .where(eq(menuItems.id, itemId))
      .returning()

    return reply.send(updated)
  })

  // DELETE /menus/:id/items/:itemId
  fastify.delete('/:id/items/:itemId', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id, itemId } = request.params as { id: string; itemId: string }

    const [menu] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!menu) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    const [existingItem] = await db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.id, itemId), eq(menuItems.menuId, id)))

    if (!existingItem) {
      return reply.status(404).send({ error: 'Menu item not found' })
    }

    await db.delete(menuItems).where(eq(menuItems.id, itemId))

    return reply.status(204).send()
  })

  // POST /menus/:id/publish — upsert menu_locations
  fastify.post('/:id/publish', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = publishMenuBody.parse(request.body)

    const [menu] = await db
      .select()
      .from(menus)
      .where(and(eq(menus.id, id), eq(menus.tenantId, request.user!.tenantId)))

    if (!menu) {
      return reply.status(404).send({ error: 'Menu not found' })
    }

    await db.transaction(async (tx) => {
      // Remove assignments not in the new list
      const existing = await tx
        .select()
        .from(menuLocations)
        .where(eq(menuLocations.menuId, id))

      const existingLocationIds = new Set(existing.map((r) => r.locationId))
      const incomingSet = new Set(body.locationIds)

      // Delete removed locations
      const toDelete = [...existingLocationIds].filter((lid) => !incomingSet.has(lid))
      if (toDelete.length > 0) {
        await tx
          .delete(menuLocations)
          .where(and(eq(menuLocations.menuId, id), inArray(menuLocations.locationId, toDelete)))
      }

      // Insert new locations
      const toInsert = body.locationIds.filter((lid) => !existingLocationIds.has(lid))
      if (toInsert.length > 0) {
        await tx.insert(menuLocations).values(
          toInsert.map((locationId) => ({ menuId: id, locationId })),
        )
      }
    })

    const assignments = await db
      .select()
      .from(menuLocations)
      .where(eq(menuLocations.menuId, id))

    return reply.send({
      menuId: id,
      locationIds: assignments.map((a) => a.locationId),
    })
  })
}
