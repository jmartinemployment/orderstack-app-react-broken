import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq, and, gte, lte, sql, count, asc, desc } from 'drizzle-orm'
import { Queue } from 'bullmq'
import {
  orders,
  orderItems,
  payments,
  employees,
  timeEntries,
  inventoryItems,
  inventoryLevels,
  productVariants,
  products,
} from '@orderstack/db'
import { env } from '../config/env.js'

// ─── BullMQ Queue ─────────────────────────────────────────────────────────────

const reportsQueue = new Queue('reports', {
  connection: { host: new URL(env.REDIS_URL).hostname, port: Number(new URL(env.REDIS_URL).port) || 6379 },
})

// ─── Schemas ──────────────────────────────────────────────────────────────────

const groupByValues = ['hour', 'day', 'week', 'month'] as const
const reportTypeValues = ['sales', 'products', 'employees', 'inventory', 'payments'] as const
const exportFormatValues = ['csv', 'pdf', 'xlsx'] as const

const salesQuery = z.object({
  locationId: z.string().optional(),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  groupBy: z.enum(groupByValues).optional().default('day'),
})

const productMixQuery = z.object({
  locationId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

const laborQuery = z.object({
  locationId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

const inventoryQuery = z.object({
  locationId: z.string().optional(),
})

const paymentMethodQuery = z.object({
  locationId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
})

const exportBody = z.object({
  reportType: z.enum(reportTypeValues),
  locationId: z.string().optional(),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  format: z.enum(exportFormatValues),
})

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const reportsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All report routes require auth + reports:read permission
  fastify.addHook('onRequest', async (request) => {
    // Skip preflight and health
    if (request.method === 'OPTIONS') return
    await request.authenticate()
    await request.requirePermission('reports', 'read')
  })

  // GET /reports/sales — sales summary
  fastify.get('/sales', async (request, reply) => {
    const db = request.tenantDb
    const query = salesQuery.parse(request.query)
    const { locationId, dateFrom, dateTo, groupBy } = query

    const from = new Date(dateFrom)
    const to = new Date(dateTo)

    const conditions = [
      eq(payments.tenantId, request.user!.tenantId),
      gte(payments.createdAt, from),
      lte(payments.createdAt, to),
    ]

    if (locationId) {
      conditions.push(eq(payments.locationId, locationId))
    }

    const where = and(...conditions)

    // Aggregate summary from payments joined to orders
    const [summary] = await db
      .select({
        grossSales: sql<string>`COALESCE(SUM(${orders.subtotal}), 0)`,
        netSales: sql<string>`COALESCE(SUM(${orders.subtotal} - ${orders.discountTotal}), 0)`,
        taxCollected: sql<string>`COALESCE(SUM(${orders.taxTotal}), 0)`,
        tips: sql<string>`COALESCE(SUM(${payments.tipAmount}), 0)`,
        refunds: sql<string>`COALESCE(SUM(CASE WHEN ${payments.status} IN ('refunded','partially_refunded') THEN ${payments.amount} ELSE 0 END), 0)`,
        orderCount: count(orders.id),
        avgOrderValue: sql<string>`COALESCE(AVG(${orders.total}), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(where)

    // Breakdown by time group
    const truncExpr = sql`date_trunc(${groupBy}, ${payments.createdAt})`

    const breakdown = await db
      .select({
        period: truncExpr,
        grossSales: sql<string>`COALESCE(SUM(${orders.subtotal}), 0)`,
        netSales: sql<string>`COALESCE(SUM(${orders.subtotal} - ${orders.discountTotal}), 0)`,
        taxCollected: sql<string>`COALESCE(SUM(${orders.taxTotal}), 0)`,
        tips: sql<string>`COALESCE(SUM(${payments.tipAmount}), 0)`,
        orderCount: count(orders.id),
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(where)
      .groupBy(truncExpr)
      .orderBy(asc(truncExpr))

    return reply.send({
      summary: {
        grossSales: Number(summary?.grossSales ?? 0),
        netSales: Number(summary?.netSales ?? 0),
        taxCollected: Number(summary?.taxCollected ?? 0),
        tips: Number(summary?.tips ?? 0),
        refunds: Number(summary?.refunds ?? 0),
        orderCount: Number(summary?.orderCount ?? 0),
        avgOrderValue: Number(summary?.avgOrderValue ?? 0),
      },
      breakdown: breakdown.map((row) => ({
        period: row.period,
        grossSales: Number(row.grossSales),
        netSales: Number(row.netSales),
        taxCollected: Number(row.taxCollected),
        tips: Number(row.tips),
        orderCount: Number(row.orderCount),
      })),
    })
  })

  // GET /reports/products — product mix report
  fastify.get('/products', async (request, reply) => {
    const db = request.tenantDb
    const query = productMixQuery.parse(request.query)
    const { locationId, dateFrom, dateTo } = query

    const conditions = [eq(orders.tenantId, request.user!.tenantId)]

    if (locationId) conditions.push(eq(orders.locationId, locationId))
    if (dateFrom) conditions.push(gte(orders.createdAt, new Date(dateFrom)))
    if (dateTo) conditions.push(lte(orders.createdAt, new Date(dateTo)))

    // Aggregate order items joined through orders
    const rows = await db
      .select({
        productVariantId: orderItems.productVariantId,
        productName: products.name,
        variantName: productVariants.name,
        totalQuantity: sql<string>`SUM(${orderItems.quantity})`,
        totalRevenue: sql<string>`SUM(${orderItems.total})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(productVariants, eq(orderItems.productVariantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(...conditions))
      .groupBy(orderItems.productVariantId, products.name, productVariants.name)
      .orderBy(desc(sql`SUM(${orderItems.total})`))
      .limit(100)

    // Calculate total revenue for % share
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.totalRevenue), 0)

    return reply.send({
      data: rows.map((row) => ({
        productVariantId: row.productVariantId,
        productName: row.productName,
        variantName: row.variantName,
        totalQuantity: Number(row.totalQuantity),
        totalRevenue: Number(row.totalRevenue),
        percentOfSales:
          totalRevenue > 0
            ? Math.round((Number(row.totalRevenue) / totalRevenue) * 10000) / 100
            : 0,
      })),
      totalRevenue,
    })
  })

  // GET /reports/employees — labor report
  fastify.get('/employees', async (request, reply) => {
    const db = request.tenantDb
    const query = laborQuery.parse(request.query)
    const { locationId, dateFrom, dateTo } = query

    const conditions = [eq(employees.tenantId, request.user!.tenantId)]

    const timeConditions = []
    if (locationId) timeConditions.push(eq(timeEntries.locationId, locationId))
    if (dateFrom) timeConditions.push(gte(timeEntries.clockIn, new Date(dateFrom)))
    if (dateTo) timeConditions.push(lte(timeEntries.clockIn, new Date(dateTo)))

    const rows = await db
      .select({
        employeeId: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        payType: employees.payType,
        payRate: employees.payRate,
        totalHours: sql<string>`COALESCE(SUM(${timeEntries.regularHours}), 0)`,
        overtimeHours: sql<string>`COALESCE(SUM(${timeEntries.overtimeHours}), 0)`,
        grossPay: sql<string>`COALESCE(SUM(${timeEntries.grossPay}), 0)`,
        shiftCount: count(timeEntries.id),
      })
      .from(employees)
      .leftJoin(
        timeEntries,
        and(
          eq(timeEntries.employeeId, employees.id),
          timeConditions.length > 0 ? and(...timeConditions) : sql`1=1`,
        ),
      )
      .where(and(...conditions))
      .groupBy(
        employees.id,
        employees.firstName,
        employees.lastName,
        employees.payType,
        employees.payRate,
      )
      .orderBy(asc(employees.lastName), asc(employees.firstName))

    // Get total sales for the period to compute labor % of sales
    const salesConditions = [eq(payments.tenantId, request.user!.tenantId)]
    if (locationId) salesConditions.push(eq(payments.locationId, locationId))
    if (dateFrom) salesConditions.push(gte(payments.createdAt, new Date(dateFrom)))
    if (dateTo) salesConditions.push(lte(payments.createdAt, new Date(dateTo)))

    const [{ totalSales }] = await db
      .select({
        totalSales: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(and(...salesConditions))

    const totalSalesNum = Number(totalSales)
    const totalLaborCost = rows.reduce((s, r) => s + Number(r.grossPay), 0)

    return reply.send({
      data: rows.map((row) => ({
        employeeId: row.employeeId,
        name: `${row.firstName} ${row.lastName}`,
        payType: row.payType,
        payRate: Number(row.payRate),
        totalHours: Number(row.totalHours),
        overtimeHours: Number(row.overtimeHours),
        grossPay: Number(row.grossPay),
        shiftCount: Number(row.shiftCount),
        laborPctOfSales:
          totalSalesNum > 0
            ? Math.round((Number(row.grossPay) / totalSalesNum) * 10000) / 100
            : 0,
      })),
      summary: {
        totalLaborCost,
        totalSales: totalSalesNum,
        laborPctOfSales:
          totalSalesNum > 0
            ? Math.round((totalLaborCost / totalSalesNum) * 10000) / 100
            : 0,
      },
    })
  })

  // GET /reports/inventory — inventory valuation
  fastify.get('/inventory', async (request, reply) => {
    const db = request.tenantDb
    const query = inventoryQuery.parse(request.query)
    const { locationId } = query

    const levelConditions = []
    if (locationId) levelConditions.push(eq(inventoryLevels.locationId, locationId))

    const rows = await db
      .select({
        inventoryItemId: inventoryItems.id,
        productVariantId: inventoryItems.productVariantId,
        productName: products.name,
        variantName: productVariants.name,
        sku: productVariants.sku,
        cost: productVariants.cost,
        unitOfMeasure: inventoryItems.unitOfMeasure,
        reorderPoint: inventoryItems.reorderPoint,
        quantityOnHand: sql<string>`COALESCE(SUM(${inventoryLevels.quantityOnHand}), 0)`,
        quantityAvailable: sql<string>`COALESCE(SUM(${inventoryLevels.quantityAvailable}), 0)`,
      })
      .from(inventoryItems)
      .innerJoin(productVariants, eq(inventoryItems.productVariantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(
        inventoryLevels,
        and(
          eq(inventoryLevels.inventoryItemId, inventoryItems.id),
          levelConditions.length > 0 ? and(...levelConditions) : sql`1=1`,
        ),
      )
      .where(eq(inventoryItems.tenantId, request.user!.tenantId))
      .groupBy(
        inventoryItems.id,
        inventoryItems.productVariantId,
        products.name,
        productVariants.name,
        productVariants.sku,
        productVariants.cost,
        inventoryItems.unitOfMeasure,
        inventoryItems.reorderPoint,
      )
      .orderBy(asc(products.name))

    const items = rows.map((row) => {
      const qty = Number(row.quantityOnHand)
      const cost = Number(row.cost ?? 0)
      const value = qty * cost
      const reorderPoint = row.reorderPoint != null ? Number(row.reorderPoint) : null
      return {
        inventoryItemId: row.inventoryItemId,
        productVariantId: row.productVariantId,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        unitOfMeasure: row.unitOfMeasure,
        cost,
        quantityOnHand: qty,
        quantityAvailable: Number(row.quantityAvailable),
        totalValue: value,
        reorderPoint,
        isLowStock: reorderPoint != null && qty <= reorderPoint,
      }
    })

    const totalValue = items.reduce((s, i) => s + i.totalValue, 0)
    const lowStockItems = items.filter((i) => i.isLowStock)

    return reply.send({
      data: items,
      summary: {
        totalValue,
        totalItems: items.length,
        lowStockCount: lowStockItems.length,
      },
      lowStockItems,
    })
  })

  // GET /reports/payments — payment method breakdown
  fastify.get('/payments', async (request, reply) => {
    const db = request.tenantDb
    const query = paymentMethodQuery.parse(request.query)
    const { locationId, dateFrom, dateTo } = query

    const conditions = [eq(payments.tenantId, request.user!.tenantId)]

    if (locationId) conditions.push(eq(payments.locationId, locationId))
    if (dateFrom) conditions.push(gte(payments.createdAt, new Date(dateFrom)))
    if (dateTo) conditions.push(lte(payments.createdAt, new Date(dateTo)))

    const rows = await db
      .select({
        paymentMethod: payments.paymentMethod,
        processor: payments.processor,
        transactionCount: count(payments.id),
        totalAmount: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
        totalTips: sql<string>`COALESCE(SUM(${payments.tipAmount}), 0)`,
      })
      .from(payments)
      .where(and(...conditions))
      .groupBy(payments.paymentMethod, payments.processor)
      .orderBy(desc(sql`SUM(${payments.amount})`))

    const grandTotal = rows.reduce((s, r) => s + Number(r.totalAmount), 0)

    return reply.send({
      data: rows.map((row) => ({
        paymentMethod: row.paymentMethod,
        processor: row.processor,
        transactionCount: Number(row.transactionCount),
        totalAmount: Number(row.totalAmount),
        totalTips: Number(row.totalTips),
        percentOfTotal:
          grandTotal > 0
            ? Math.round((Number(row.totalAmount) / grandTotal) * 10000) / 100
            : 0,
      })),
      summary: {
        grandTotal,
        transactionCount: rows.reduce((s, r) => s + Number(r.transactionCount), 0),
        totalTips: rows.reduce((s, r) => s + Number(r.totalTips), 0),
      },
    })
  })

  // POST /reports/export — async export job
  fastify.post('/export', async (request, reply) => {
    const body = exportBody.parse(request.body)
    const jobId = nanoid()

    await reportsQueue.add(
      'export',
      {
        jobId,
        tenantId: request.user!.tenantId,
        userId: request.user!.id,
        reportType: body.reportType,
        locationId: body.locationId ?? null,
        dateFrom: body.dateFrom,
        dateTo: body.dateTo,
        format: body.format,
      },
      {
        jobId,
        removeOnComplete: { age: 60 * 60 * 24 }, // keep for 24h
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    )

    return reply.status(202).send({ jobId })
  })

  // GET /reports/export/:jobId — poll export status
  fastify.get('/export/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }

    const job = await reportsQueue.getJob(jobId)

    if (!job) {
      return reply.status(404).send({ error: 'Export job not found' })
    }

    const state = await job.getState()

    // Map BullMQ states to our API states
    const statusMap: Record<string, string> = {
      waiting: 'pending',
      delayed: 'pending',
      active: 'processing',
      completed: 'complete',
      failed: 'failed',
      prioritized: 'pending',
      'waiting-children': 'pending',
    }

    const status = statusMap[state] ?? 'pending'

    const response: Record<string, unknown> = { status }

    if (status === 'complete' && job.returnvalue?.fileUrl) {
      response.fileUrl = job.returnvalue.fileUrl
    }

    if (status === 'failed') {
      response.error = job.failedReason ?? 'Export failed'
    }

    return reply.send(response)
  })
}
