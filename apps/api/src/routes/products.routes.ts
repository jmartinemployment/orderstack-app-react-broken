import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, or, ilike, asc, count } from 'drizzle-orm'
import {
  products,
  productVariants,
  modifierGroups,
  productModifierGroups,
} from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const productTypeValues = ['item', 'modifier', 'combo', 'service'] as const

const createProductBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  productType: z.enum(productTypeValues).optional().default('item'),
  imageUrl: z.string().url().optional(),
  taxClassId: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  trackInventory: z.boolean().optional().default(false),
})

const updateProductBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  productType: z.enum(productTypeValues).optional(),
  imageUrl: z.string().url().nullable().optional(),
  taxClassId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

const createVariantBody = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  trackInventory: z.boolean().optional().default(false),
  weight: z.number().nonnegative().optional(),
  sortOrder: z.number().int().optional().default(0),
})

const updateVariantBody = z.object({
  name: z.string().min(1).max(255).optional(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  trackInventory: z.boolean().optional(),
  weight: z.number().nonnegative().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

const productRowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  productType: z.enum(productTypeValues).optional().default('item'),
  imageUrl: z.string().optional(),
  taxClassId: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  trackInventory: z.boolean().optional().default(false),
})

const bulkCreateBody = z.object({
  products: z.array(productRowSchema).min(1).max(500),
})

const listProductsQuery = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  productType: z.enum(productTypeValues).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const productsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /products
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const query = listProductsQuery.parse(request.query)
    const { search, categoryId, isActive, productType, page, limit } = query
    const offset = (page - 1) * limit

    const conditions = []

    if (search) {
      conditions.push(
        or(ilike(products.name, `%${search}%`), ilike(products.description, `%${search}%`)),
      )
    }

    if (categoryId !== undefined) {
      conditions.push(eq(products.categoryId, categoryId))
    }

    if (isActive !== undefined) {
      conditions.push(eq(products.isActive, isActive))
    }

    if (productType !== undefined) {
      conditions.push(eq(products.productType, productType))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(asc(products.name))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(products).where(where),
    ])

    return reply.send({
      data: rows,
      meta: { page, limit, total: Number(total) },
    })
  })

  // POST /products
  fastify.post('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createProductBody.parse(request.body)
    const productId = nanoid()
    const variantId = nanoid()
    const now = new Date()

    await db.transaction(async (tx) => {
      await tx.insert(products).values({
        id: productId,
        tenantId: request.user!.tenantId,
        name: body.name,
        description: body.description ?? null,
        sku: body.sku ?? null,
        barcode: body.barcode ?? null,
        categoryId: body.categoryId ?? null,
        productType: body.productType,
        imageUrl: body.imageUrl ?? null,
        taxClassId: body.taxClassId ?? null,
        isActive: true,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(productVariants).values({
        id: variantId,
        productId,
        name: 'Default',
        sku: body.sku ?? null,
        barcode: body.barcode ?? null,
        price: String(body.price),
        cost: body.cost != null ? String(body.cost) : null,
        trackInventory: body.trackInventory ?? false,
        isActive: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
    })

    const [product] = await db.select().from(products).where(eq(products.id, productId))
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))

    return reply.status(201).send({ ...product, variants: [variant] })
  })

  // GET /products/bulk  — must be registered BEFORE /:id to avoid conflict
  // POST /products/bulk
  fastify.post('/bulk', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = bulkCreateBody.parse(request.body)
    const now = new Date()

    const created: Array<{ productId: string; variantId: string; name: string }> = []

    await db.transaction(async (tx) => {
      for (const row of body.products) {
        const productId = nanoid()
        const variantId = nanoid()

        await tx.insert(products).values({
          id: productId,
          tenantId: request.user!.tenantId,
          name: row.name,
          description: row.description ?? null,
          sku: row.sku ?? null,
          barcode: row.barcode ?? null,
          categoryId: row.categoryId ?? null,
          productType: row.productType ?? 'item',
          imageUrl: row.imageUrl ?? null,
          taxClassId: row.taxClassId ?? null,
          isActive: true,
          metadata: {},
          createdAt: now,
          updatedAt: now,
        })

        await tx.insert(productVariants).values({
          id: variantId,
          productId,
          name: 'Default',
          sku: row.sku ?? null,
          barcode: row.barcode ?? null,
          price: String(row.price),
          cost: row.cost != null ? String(row.cost) : null,
          trackInventory: row.trackInventory ?? false,
          isActive: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })

        created.push({ productId, variantId, name: row.name })
      }
    })

    return reply.status(201).send({ created: created.length, items: created })
  })

  // GET /products/:id
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [product] = await db.select().from(products).where(eq(products.id, id))

    if (!product) {
      return reply.status(404).send({ error: 'Product not found' })
    }

    const [variants, modGroups] = await Promise.all([
      db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, id))
        .orderBy(asc(productVariants.sortOrder)),
      db
        .select({
          modifierGroup: modifierGroups,
          sortOrder: productModifierGroups.sortOrder,
        })
        .from(productModifierGroups)
        .innerJoin(
          modifierGroups,
          eq(productModifierGroups.modifierGroupId, modifierGroups.id),
        )
        .where(eq(productModifierGroups.productId, id))
        .orderBy(asc(productModifierGroups.sortOrder)),
    ])

    return reply.send({
      ...product,
      variants,
      modifierGroups: modGroups.map((r) => r.modifierGroup),
    })
  })

  // PATCH /products/:id
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateProductBody.parse(request.body)

    const [existing] = await db.select().from(products).where(eq(products.id, id))

    if (!existing) {
      return reply.status(404).send({ error: 'Product not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.sku !== undefined) updateData.sku = body.sku
    if (body.barcode !== undefined) updateData.barcode = body.barcode
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId
    if (body.productType !== undefined) updateData.productType = body.productType
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl
    if (body.taxClassId !== undefined) updateData.taxClassId = body.taxClassId
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning()

    return reply.send(updated)
  })

  // DELETE /products/:id — soft delete
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [existing] = await db.select().from(products).where(eq(products.id, id))

    if (!existing) {
      return reply.status(404).send({ error: 'Product not found' })
    }

    await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id))

    return reply.status(204).send()
  })

  // ─── Variants ─────────────────────────────────────────────────────────────

  // GET /products/:id/variants
  fastify.get('/:id/variants', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [product] = await db.select().from(products).where(eq(products.id, id))

    if (!product) {
      return reply.status(404).send({ error: 'Product not found' })
    }

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.sortOrder))

    return reply.send({ data: variants })
  })

  // POST /products/:id/variants
  fastify.post('/:id/variants', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [product] = await db.select().from(products).where(eq(products.id, id))

    if (!product) {
      return reply.status(404).send({ error: 'Product not found' })
    }

    const body = createVariantBody.parse(request.body)
    const variantId = nanoid()
    const now = new Date()

    await db.insert(productVariants).values({
      id: variantId,
      productId: id,
      name: body.name,
      sku: body.sku ?? null,
      barcode: body.barcode ?? null,
      price: String(body.price),
      cost: body.cost != null ? String(body.cost) : null,
      trackInventory: body.trackInventory ?? false,
      weight: body.weight != null ? String(body.weight) : null,
      isActive: true,
      sortOrder: body.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })

    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))

    return reply.status(201).send(variant)
  })

  // PATCH /products/:id/variants/:variantId
  fastify.patch('/:id/variants/:variantId', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id, variantId } = request.params as { id: string; variantId: string }
    const body = updateVariantBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, id)))

    if (!existing) {
      return reply.status(404).send({ error: 'Variant not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.sku !== undefined) updateData.sku = body.sku
    if (body.barcode !== undefined) updateData.barcode = body.barcode
    if (body.price !== undefined) updateData.price = String(body.price)
    if (body.cost !== undefined) updateData.cost = body.cost != null ? String(body.cost) : null
    if (body.trackInventory !== undefined) updateData.trackInventory = body.trackInventory
    if (body.weight !== undefined)
      updateData.weight = body.weight != null ? String(body.weight) : null
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const [updated] = await db
      .update(productVariants)
      .set(updateData)
      .where(eq(productVariants.id, variantId))
      .returning()

    return reply.send(updated)
  })

  // DELETE /products/:id/variants/:variantId — soft delete
  fastify.delete('/:id/variants/:variantId', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id, variantId } = request.params as { id: string; variantId: string }

    const [existing] = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, id)))

    if (!existing) {
      return reply.status(404).send({ error: 'Variant not found' })
    }

    await db
      .update(productVariants)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(productVariants.id, variantId))

    return reply.status(204).send()
  })
}
