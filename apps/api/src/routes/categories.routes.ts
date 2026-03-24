import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, count } from 'drizzle-orm'
import { categories, products } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createCategoryBody = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional().default(0),
  parentCategoryId: z.string().nullable().optional(),
})

const updateCategoryBody = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().optional(),
  parentCategoryId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CategoryRow = typeof categories.$inferSelect
type CategoryWithChildren = CategoryRow & { children: CategoryWithChildren[] }

function buildTree(rows: CategoryRow[]): CategoryWithChildren[] {
  const map = new Map<string, CategoryWithChildren>()
  const roots: CategoryWithChildren[] = []

  for (const row of rows) {
    map.set(row.id, { ...row, children: [] })
  }

  for (const node of map.values()) {
    if (node.parentCategoryId && map.has(node.parentCategoryId)) {
      map.get(node.parentCategoryId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const categoriesRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /categories — tree structure
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.tenantId, request.user!.tenantId))
      .orderBy(categories.sortOrder, categories.name)

    const tree = buildTree(rows)

    return reply.send({ data: tree })
  })

  // POST /categories
  fastify.post('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createCategoryBody.parse(request.body)

    // Validate parent exists if provided
    if (body.parentCategoryId) {
      const [parent] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, body.parentCategoryId))

      if (!parent) {
        return reply.status(400).send({ error: 'Parent category not found' })
      }
    }

    const id = nanoid()
    const now = new Date()

    await db.insert(categories).values({
      id,
      tenantId: request.user!.tenantId,
      name: body.name,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      sortOrder: body.sortOrder ?? 0,
      isActive: true,
      parentCategoryId: body.parentCategoryId ?? null,
      createdAt: now,
      updatedAt: now,
    })

    const [category] = await db.select().from(categories).where(eq(categories.id, id))

    return reply.status(201).send(category)
  })

  // GET /categories/:id — with children
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, request.user!.tenantId)))

    if (!category) {
      return reply.status(404).send({ error: 'Category not found' })
    }

    const children = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.parentCategoryId, id),
          eq(categories.tenantId, request.user!.tenantId),
        ),
      )
      .orderBy(categories.sortOrder, categories.name)

    return reply.send({ ...category, children })
  })

  // PATCH /categories/:id
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateCategoryBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Category not found' })
    }

    // Validate new parent exists if provided and prevent self-reference
    if (body.parentCategoryId !== undefined && body.parentCategoryId !== null) {
      if (body.parentCategoryId === id) {
        return reply.status(400).send({ error: 'Category cannot be its own parent' })
      }

      const [parent] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, body.parentCategoryId))

      if (!parent) {
        return reply.status(400).send({ error: 'Parent category not found' })
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder
    if (body.parentCategoryId !== undefined) updateData.parentCategoryId = body.parentCategoryId
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const [updated] = await db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning()

    return reply.send(updated)
  })

  // DELETE /categories/:id
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Category not found' })
    }

    // Check for active products referencing this category
    const [{ total }] = await db
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.categoryId, id), eq(products.isActive, true)))

    if (Number(total) > 0) {
      return reply.status(409).send({
        error: 'Cannot delete category with active products',
        activeProductCount: Number(total),
      })
    }

    await db.delete(categories).where(eq(categories.id, id))

    return reply.status(204).send()
  })
}
