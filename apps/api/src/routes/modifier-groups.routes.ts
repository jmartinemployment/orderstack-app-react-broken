import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, count, inArray } from 'drizzle-orm'
import { modifierGroups, modifiers, productModifierGroups } from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const modifierSchema = z.object({
  id: z.string().optional(), // present on upsert
  name: z.string().min(1).max(255),
  priceDelta: z.number().optional().default(0),
  costDelta: z.number().optional().default(0),
  sku: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
})

const selectionTypeValues = ['single', 'multiple'] as const

const createModifierGroupBody = z.object({
  name: z.string().min(1).max(255),
  selectionType: z.enum(selectionTypeValues).optional().default('single'),
  minSelections: z.number().int().nonnegative().optional().default(0),
  maxSelections: z.number().int().positive().nullable().optional(),
  isRequired: z.boolean().optional().default(false),
  modifiers: z.array(modifierSchema).optional().default([]),
})

const updateModifierGroupBody = z.object({
  name: z.string().min(1).max(255).optional(),
  selectionType: z.enum(selectionTypeValues).optional(),
  minSelections: z.number().int().nonnegative().optional(),
  maxSelections: z.number().int().positive().nullable().optional(),
  isRequired: z.boolean().optional(),
  modifiers: z.array(modifierSchema).optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const modifierGroupsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /modifier-groups
  fastify.get('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const groups = await db
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.tenantId, request.user!.tenantId))
      .orderBy(modifierGroups.name)

    const groupIds = groups.map((g) => g.id)

    let modifierRows: Array<typeof modifiers.$inferSelect> = []

    if (groupIds.length > 0) {
      modifierRows = await db
        .select()
        .from(modifiers)
        .where(inArray(modifiers.modifierGroupId, groupIds))
        .orderBy(modifiers.sortOrder)
    }

    const modifiersByGroup = new Map<string, typeof modifierRows>()
    for (const mod of modifierRows) {
      const list = modifiersByGroup.get(mod.modifierGroupId) ?? []
      list.push(mod)
      modifiersByGroup.set(mod.modifierGroupId, list)
    }

    const data = groups.map((group) => ({
      ...group,
      modifiers: modifiersByGroup.get(group.id) ?? [],
    }))

    return reply.send({ data })
  })

  // POST /modifier-groups
  fastify.post('/', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createModifierGroupBody.parse(request.body)
    const groupId = nanoid()
    const now = new Date()

    await db.transaction(async (tx) => {
      await tx.insert(modifierGroups).values({
        id: groupId,
        tenantId: request.user!.tenantId,
        name: body.name,
        selectionType: body.selectionType,
        minSelections: body.minSelections ?? 0,
        maxSelections: body.maxSelections ?? null,
        isRequired: body.isRequired ?? false,
        createdAt: now,
        updatedAt: now,
      })

      if (body.modifiers.length > 0) {
        await tx.insert(modifiers).values(
          body.modifiers.map((m, idx) => ({
            id: nanoid(),
            modifierGroupId: groupId,
            name: m.name,
            priceDelta: String(m.priceDelta ?? 0),
            costDelta: String(m.costDelta ?? 0),
            sku: m.sku ?? null,
            isActive: m.isActive ?? true,
            sortOrder: m.sortOrder ?? idx,
          })),
        )
      }
    })

    const [group] = await db
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.id, groupId))

    const groupModifiers = await db
      .select()
      .from(modifiers)
      .where(eq(modifiers.modifierGroupId, groupId))
      .orderBy(modifiers.sortOrder)

    return reply.status(201).send({ ...group, modifiers: groupModifiers })
  })

  // GET /modifier-groups/:id
  fastify.get('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [group] = await db
      .select()
      .from(modifierGroups)
      .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, request.user!.tenantId)))

    if (!group) {
      return reply.status(404).send({ error: 'Modifier group not found' })
    }

    const groupModifiers = await db
      .select()
      .from(modifiers)
      .where(eq(modifiers.modifierGroupId, id))
      .orderBy(modifiers.sortOrder)

    return reply.send({ ...group, modifiers: groupModifiers })
  })

  // PATCH /modifier-groups/:id
  fastify.patch('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateModifierGroupBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(modifierGroups)
      .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Modifier group not found' })
    }

    await db.transaction(async (tx) => {
      const groupUpdateData: Record<string, unknown> = { updatedAt: new Date() }

      if (body.name !== undefined) groupUpdateData.name = body.name
      if (body.selectionType !== undefined) groupUpdateData.selectionType = body.selectionType
      if (body.minSelections !== undefined) groupUpdateData.minSelections = body.minSelections
      if (body.maxSelections !== undefined) groupUpdateData.maxSelections = body.maxSelections
      if (body.isRequired !== undefined) groupUpdateData.isRequired = body.isRequired

      await tx.update(modifierGroups).set(groupUpdateData).where(eq(modifierGroups.id, id))

      // Upsert modifiers if provided
      if (body.modifiers !== undefined) {
        const incomingWithId = body.modifiers.filter((m) => m.id)
        const incomingNew = body.modifiers.filter((m) => !m.id)

        // Update existing modifiers
        for (const mod of incomingWithId) {
          await tx
            .update(modifiers)
            .set({
              name: mod.name,
              priceDelta: String(mod.priceDelta ?? 0),
              costDelta: String(mod.costDelta ?? 0),
              sku: mod.sku ?? null,
              isActive: mod.isActive ?? true,
              sortOrder: mod.sortOrder ?? 0,
            })
            .where(
              and(eq(modifiers.id, mod.id!), eq(modifiers.modifierGroupId, id)),
            )
        }

        // Insert new modifiers
        if (incomingNew.length > 0) {
          await tx.insert(modifiers).values(
            incomingNew.map((m, idx) => ({
              id: nanoid(),
              modifierGroupId: id,
              name: m.name,
              priceDelta: String(m.priceDelta ?? 0),
              costDelta: String(m.costDelta ?? 0),
              sku: m.sku ?? null,
              isActive: m.isActive ?? true,
              sortOrder: m.sortOrder ?? incomingWithId.length + idx,
            })),
          )
        }
      }
    })

    const [updated] = await db
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.id, id))

    const groupModifiers = await db
      .select()
      .from(modifiers)
      .where(eq(modifiers.modifierGroupId, id))
      .orderBy(modifiers.sortOrder)

    return reply.send({ ...updated, modifiers: groupModifiers })
  })

  // DELETE /modifier-groups/:id
  fastify.delete('/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }

    const [existing] = await db
      .select()
      .from(modifierGroups)
      .where(and(eq(modifierGroups.id, id), eq(modifierGroups.tenantId, request.user!.tenantId)))

    if (!existing) {
      return reply.status(404).send({ error: 'Modifier group not found' })
    }

    // Check if in use by products
    const [{ total }] = await db
      .select({ total: count() })
      .from(productModifierGroups)
      .where(eq(productModifierGroups.modifierGroupId, id))

    if (Number(total) > 0) {
      return reply.status(409).send({
        error: 'Cannot delete modifier group that is in use by products',
        productCount: Number(total),
      })
    }

    await db.delete(modifierGroups).where(eq(modifierGroups.id, id))

    return reply.status(204).send()
  })
}
