import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, asc, desc } from 'drizzle-orm'
import {
  loyaltyPrograms,
  loyaltyAccounts,
  loyaltyTransactions,
  loyaltyTiers,
} from '@orderstack/db'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loyaltyProgramTypeValues = ['points', 'visits', 'spend'] as const

const createProgramBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(loyaltyProgramTypeValues),
  pointsPerDollar: z.number().nonnegative().optional(),
  visitThreshold: z.number().int().positive().optional(),
  spendThreshold: z.number().nonnegative().optional(),
  expiryDays: z.number().int().positive().optional(),
  config: z.record(z.unknown()).optional(),
})

const updateProgramBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(loyaltyProgramTypeValues).optional(),
  pointsPerDollar: z.number().nonnegative().optional(),
  visitThreshold: z.number().int().positive().nullable().optional(),
  spendThreshold: z.number().nonnegative().nullable().optional(),
  expiryDays: z.number().int().positive().nullable().optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

const adjustPointsBody = z.object({
  programId: z.string().min(1),
  pointsDelta: z.number(),
  notes: z.string().optional(),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const loyaltyRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /loyalty/programs — list programs for tenant
  fastify.get('/programs', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const programs = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.tenantId, request.user!.tenantId))
      .orderBy(asc(loyaltyPrograms.name))

    return reply.send({ data: programs })
  })

  // POST /loyalty/programs — create a loyalty program
  fastify.post('/programs', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const body = createProgramBody.parse(request.body)
    const id = nanoid()
    const now = new Date()

    await db.insert(loyaltyPrograms).values({
      id,
      tenantId: request.user!.tenantId,
      name: body.name,
      type: body.type,
      isActive: true,
      pointsPerDollar: body.pointsPerDollar != null ? String(body.pointsPerDollar) : '1',
      visitThreshold: body.visitThreshold ?? null,
      spendThreshold: body.spendThreshold != null ? String(body.spendThreshold) : null,
      expiryDays: body.expiryDays ?? null,
      config: body.config ?? {},
      createdAt: now,
      updatedAt: now,
    })

    const [program] = await db
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.id, id))

    return reply.status(201).send(program)
  })

  // PATCH /loyalty/programs/:id — update program config
  fastify.patch('/programs/:id', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { id } = request.params as { id: string }
    const body = updateProgramBody.parse(request.body)

    const [existing] = await db
      .select()
      .from(loyaltyPrograms)
      .where(
        and(
          eq(loyaltyPrograms.id, id),
          eq(loyaltyPrograms.tenantId, request.user!.tenantId),
        ),
      )

    if (!existing) {
      return reply.status(404).send({ error: 'Loyalty program not found' })
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.name !== undefined) updateData.name = body.name
    if (body.type !== undefined) updateData.type = body.type
    if (body.pointsPerDollar !== undefined)
      updateData.pointsPerDollar = String(body.pointsPerDollar)
    if (body.visitThreshold !== undefined) updateData.visitThreshold = body.visitThreshold
    if (body.spendThreshold !== undefined)
      updateData.spendThreshold =
        body.spendThreshold != null ? String(body.spendThreshold) : null
    if (body.expiryDays !== undefined) updateData.expiryDays = body.expiryDays
    if (body.config !== undefined) updateData.config = body.config
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    const [updated] = await db
      .update(loyaltyPrograms)
      .set(updateData)
      .where(eq(loyaltyPrograms.id, id))
      .returning()

    return reply.send(updated)
  })

  // GET /loyalty/accounts/:customerId — get loyalty accounts for customer with tier and balance
  fastify.get('/accounts/:customerId', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { customerId } = request.params as { customerId: string }

    const accounts = await db
      .select({
        account: loyaltyAccounts,
        program: loyaltyPrograms,
        tier: loyaltyTiers,
      })
      .from(loyaltyAccounts)
      .innerJoin(loyaltyPrograms, eq(loyaltyAccounts.programId, loyaltyPrograms.id))
      .leftJoin(loyaltyTiers, eq(loyaltyAccounts.tierId, loyaltyTiers.id))
      .where(eq(loyaltyAccounts.customerId, customerId))
      .orderBy(desc(loyaltyAccounts.enrolledAt))

    const result = accounts.map(({ account, program, tier }) => ({
      ...account,
      program,
      tier: tier ?? null,
    }))

    return reply.send({ data: result })
  })

  // POST /loyalty/accounts/:customerId/adjust — manual points adjustment
  fastify.post('/accounts/:customerId/adjust', async (request, reply) => {
    await request.authenticate()
    const db = request.tenantDb

    const { customerId } = request.params as { customerId: string }
    const body = adjustPointsBody.parse(request.body)

    // Find the loyalty account for this customer + program
    const [account] = await db
      .select()
      .from(loyaltyAccounts)
      .where(
        and(
          eq(loyaltyAccounts.customerId, customerId),
          eq(loyaltyAccounts.programId, body.programId),
        ),
      )

    if (!account) {
      return reply.status(404).send({ error: 'Loyalty account not found for this customer and program' })
    }

    const transactionId = nanoid()
    const now = new Date()
    const currentBalance = Number(account.pointsBalance)
    const newBalance = currentBalance + body.pointsDelta
    const newLifetime =
      body.pointsDelta > 0
        ? Number(account.lifetimePoints) + body.pointsDelta
        : Number(account.lifetimePoints)

    await db.transaction(async (tx) => {
      // Create the loyalty transaction record
      await tx.insert(loyaltyTransactions).values({
        id: transactionId,
        loyaltyAccountId: account.id,
        transactionType: 'adjust',
        pointsDelta: String(body.pointsDelta),
        notes: body.notes ?? null,
        createdAt: now,
      })

      // Update the loyalty account balance
      await tx
        .update(loyaltyAccounts)
        .set({
          pointsBalance: String(newBalance),
          lifetimePoints: String(newLifetime),
          lastActivityAt: now,
        })
        .where(eq(loyaltyAccounts.id, account.id))
    })

    const [updatedAccount] = await db
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.id, account.id))

    const [transaction] = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.id, transactionId))

    return reply.status(201).send({
      transaction,
      account: updatedAccount,
    })
  })
}
