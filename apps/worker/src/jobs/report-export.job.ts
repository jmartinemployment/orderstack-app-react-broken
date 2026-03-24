import type { Job } from 'bullmq'
import { withTenantSchema } from '@orderstack/db'
import { orders, orderItems, paymentPeriods, payments } from '@orderstack/db/schema'
import { and, gte, lte, eq, sql } from 'drizzle-orm'

export const REPORT_EXPORT_QUEUE = 'report-export'

interface ReportExportPayload {
  jobId: string
  tenantId: string
  reportType: 'sales' | 'products' | 'employees' | 'inventory' | 'payments'
  locationId?: string
  dateFrom: string
  dateTo: string
  format: 'csv' | 'pdf' | 'xlsx'
}

/**
 * Generates a report export file and uploads to R2.
 * Status is polled by the client via GET /reports/export/:jobId.
 * The jobId is the BullMQ job ID returned by POST /reports/export.
 */
export async function reportExportJob(job: Job<ReportExportPayload>): Promise<void> {
  const { tenantId, reportType, locationId, dateFrom, dateTo, format } = job.data

  await withTenantSchema(tenantId, async (tenantDb) => {
    let csvContent: string

    switch (reportType) {
      case 'sales': {
        const rows = await tenantDb
          .select({
            date: sql<string>`DATE(${orders.createdAt})`,
            locationId: orders.locationId,
            orderCount: sql<number>`COUNT(${orders.id})`,
            grossSales: sql<string>`SUM(${orders.total})`,
            discounts: sql<string>`SUM(${orders.discountTotal})`,
            tax: sql<string>`SUM(${orders.taxTotal})`,
            tips: sql<string>`SUM(${orders.tipAmount})`,
          })
          .from(orders)
          .where(
            and(
              gte(orders.createdAt, new Date(dateFrom)),
              lte(orders.createdAt, new Date(dateTo)),
              locationId ? eq(orders.locationId, locationId) : sql`true`,
              sql`${orders.status} NOT IN ('cancelled', 'voided')`,
            ),
          )
          .groupBy(sql`DATE(${orders.createdAt})`, orders.locationId)
          .orderBy(sql`DATE(${orders.createdAt})`)

        csvContent = toCsv(
          ['Date', 'Location ID', 'Orders', 'Gross Sales', 'Discounts', 'Tax', 'Tips'],
          rows.map((r) => [r.date, r.locationId, r.orderCount, r.grossSales, r.discounts, r.tax, r.tips]),
        )
        break
      }

      case 'payments': {
        const rows = await tenantDb
          .select({
            date: sql<string>`DATE(${payments.createdAt})`,
            method: payments.paymentMethod,
            processor: payments.processor,
            amount: sql<string>`SUM(${payments.amount})`,
            tips: sql<string>`SUM(${payments.tipAmount})`,
            count: sql<number>`COUNT(*)`,
          })
          .from(payments)
          .where(
            and(
              gte(payments.createdAt, new Date(dateFrom)),
              lte(payments.createdAt, new Date(dateTo)),
              locationId ? eq(payments.locationId, locationId) : sql`true`,
              eq(payments.status, 'captured'),
            ),
          )
          .groupBy(sql`DATE(${payments.createdAt})`, payments.paymentMethod, payments.processor)

        csvContent = toCsv(
          ['Date', 'Method', 'Processor', 'Amount', 'Tips', 'Count'],
          rows.map((r) => [r.date, r.method, r.processor ?? '', r.amount, r.tips, r.count]),
        )
        break
      }

      default:
        csvContent = 'Report type not yet implemented\n'
    }

    const fileBuffer = Buffer.from(csvContent, 'utf-8')
    const key = `reports/${tenantId}/${job.id}.csv`

    const r2Url = await uploadToR2(key, fileBuffer)
    await job.updateData({ ...job.data, fileUrl: r2Url, status: 'complete' })
  })
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const escape = (v: unknown) =>
    typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v ?? '')
  return [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
}

async function uploadToR2(key: string, buffer: Buffer): Promise<string> {
  const accountId = process.env['CLOUDFLARE_R2_ACCOUNT_ID']
  const accessKeyId = process.env['CLOUDFLARE_R2_ACCESS_KEY_ID']
  const secretKey = process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY']
  const bucket = process.env['CLOUDFLARE_R2_BUCKET'] ?? 'orderstack-assets'
  const publicUrl = process.env['CLOUDFLARE_R2_PUBLIC_URL'] ?? 'https://assets.orderstack.io'

  if (!accountId || !accessKeyId || !secretKey) {
    throw new Error('R2 credentials not configured')
  }

  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/csv' },
    body: buffer,
  })

  if (!response.ok) throw new Error(`R2 upload failed: ${response.status}`)
  return `${publicUrl}/${key}`
}
