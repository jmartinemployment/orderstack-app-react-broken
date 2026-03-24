import type { Job } from 'bullmq'
import { withTenantSchema, db } from '@orderstack/db'
import { generalLedgerExports, paymentPeriods, chartOfAccounts } from '@orderstack/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

export const GL_EXPORT_QUEUE = 'gl-export'

interface GlExportPayload {
  exportId: string
  tenantId: string
  exportType: 'quickbooks' | 'xero' | 'sage' | 'csv'
  periodStart: string
  periodEnd: string
}

/**
 * Generates a General Ledger export file and uploads to R2.
 *
 * Flow:
 * 1. Set export status = 'processing'
 * 2. Query payment_periods for the requested date range
 * 3. Render journal entries per the tenant's chart_of_accounts mapping
 * 4. Generate CSV or XML file
 * 5. Upload to Cloudflare R2
 * 6. Set file_url + status = 'complete'
 */
export async function glExportJob(job: Job<GlExportPayload>): Promise<void> {
  const { exportId, tenantId, exportType, periodStart, periodEnd } = job.data

  // Mark as processing
  await db
    .update(generalLedgerExports)
    .set({ status: 'processing' })
    .where(eq(generalLedgerExports.id, exportId))

  try {
    await withTenantSchema(tenantId, async (tenantDb) => {
      // Load payment periods in range
      const periods = await tenantDb
        .select()
        .from(paymentPeriods)
        .where(
          and(
            gte(paymentPeriods.startDate, new Date(periodStart)),
            lte(paymentPeriods.endDate, new Date(periodEnd)),
          ),
        )

      // Load chart of accounts with integration mappings
      const accounts = await tenantDb
        .select()
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.tenantId, tenantId))

      // Build journal entries
      const journalEntries = periods.map((period) => ({
        date: period.startDate.toISOString().split('T')[0],
        entries: [
          {
            account: getAccountCode(accounts, 'revenue', exportType),
            debit: null,
            credit: period.netSales,
            description: `Net Sales ${period.startDate.toISOString().split('T')[0]}`,
          },
          {
            account: getAccountCode(accounts, 'tax_liability', exportType),
            debit: null,
            credit: period.taxCollected,
            description: `Sales Tax Collected`,
          },
          {
            account: getAccountCode(accounts, 'cash', exportType),
            debit: period.cashAmount,
            credit: null,
            description: `Cash Sales`,
          },
          {
            account: getAccountCode(accounts, 'card_receivable', exportType),
            debit: period.cardAmount,
            credit: null,
            description: `Card Sales`,
          },
        ].filter((e) => Number(e.debit ?? e.credit ?? 0) > 0),
      }))

      // Generate CSV
      const csv = generateCsv(journalEntries)
      const fileBuffer = Buffer.from(csv, 'utf-8')

      // Upload to R2
      const fileUrl = await uploadToR2(
        `gl-exports/${tenantId}/${exportId}.csv`,
        fileBuffer,
        'text/csv',
      )

      // Mark complete
      await db
        .update(generalLedgerExports)
        .set({
          status: 'complete',
          fileUrl,
          exportedAt: new Date(),
        })
        .where(eq(generalLedgerExports.id, exportId))
    })
  } catch (err) {
    await db
      .update(generalLedgerExports)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(generalLedgerExports.id, exportId))

    throw err
  }
}

function getAccountCode(
  accounts: { accountNumber: string; integrationMapping: unknown }[],
  type: string,
  provider: string,
): string {
  const account = accounts.find((a) => {
    const mapping = a.integrationMapping as Record<string, Record<string, string>>
    return mapping[provider]?.[type]
  })
  return account?.accountNumber ?? type
}

function generateCsv(entries: { date: string; entries: { account: string; debit: unknown; credit: unknown; description: string }[] }[]): string {
  const rows = ['Date,Account,Debit,Credit,Description']
  for (const je of entries) {
    for (const entry of je.entries) {
      rows.push([
        je.date,
        entry.account,
        entry.debit ?? '',
        entry.credit ?? '',
        `"${entry.description}"`,
      ].join(','))
    }
  }
  return rows.join('\n')
}

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const accountId = process.env['CLOUDFLARE_R2_ACCOUNT_ID']
  const accessKeyId = process.env['CLOUDFLARE_R2_ACCESS_KEY_ID']
  const secretKey = process.env['CLOUDFLARE_R2_SECRET_ACCESS_KEY']
  const bucket = process.env['CLOUDFLARE_R2_BUCKET'] ?? 'orderstack-assets'
  const publicUrl = process.env['CLOUDFLARE_R2_PUBLIC_URL'] ?? 'https://assets.orderstack.io'

  if (!accountId || !accessKeyId || !secretKey) {
    throw new Error('R2 credentials not configured')
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`
  const url = `${endpoint}/${bucket}/${key}`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.byteLength),
    },
    body: buffer,
  })

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.status} ${response.statusText}`)
  }

  return `${publicUrl}/${key}`
}
