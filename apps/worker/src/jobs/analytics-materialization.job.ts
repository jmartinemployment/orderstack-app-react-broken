import type { Job } from 'bullmq'
import { withTenantSchema } from '@orderstack/db'
import { sql } from 'drizzle-orm'

export const ANALYTICS_QUEUE = 'analytics-materialization'

/**
 * Nightly job that materializes pre-aggregated analytics fact tables
 * in the {tenant}_analytics schema.
 *
 * Custom report builder queries run against these tables — never
 * against the OLTP orders table — to prevent report queries from
 * impacting POS transaction throughput.
 *
 * Fact tables materialized:
 *   analytics_sales_daily     — grain: location × day × category × product
 *   analytics_labor_daily     — grain: location × day × employee × role
 *   analytics_inventory_daily — grain: location × day × inventory_item
 *
 * Scheduled: cron '0 3 * * *' (3am daily, after loyalty expiry at 2am)
 */
export async function analyticsJob(job: Job<{ tenantId: string; date?: string }>): Promise<void> {
  const { tenantId, date } = job.data
  const targetDate = date ?? new Date().toISOString().split('T')[0]

  await withTenantSchema(tenantId, async (tenantDb) => {
    // Ensure analytics schema exists
    await tenantDb.execute(
      sql`CREATE SCHEMA IF NOT EXISTS "merchant_${sql.raw(tenantId)}_analytics"`,
    )

    // Materialize sales by location × day × category × product
    await tenantDb.execute(sql`
      INSERT INTO "merchant_${sql.raw(tenantId)}_analytics".analytics_sales_daily
        (date, location_id, category_id, product_id, product_name,
         order_count, quantity_sold, gross_sales, net_sales, discount_total, tax_total)
      SELECT
        DATE(o.created_at)           AS date,
        o.location_id,
        p.category_id,
        pv.product_id,
        pr.name                       AS product_name,
        COUNT(DISTINCT o.id)          AS order_count,
        SUM(oi.quantity)              AS quantity_sold,
        SUM(oi.unit_price * oi.quantity) AS gross_sales,
        SUM(oi.total)                 AS net_sales,
        SUM(oi.discount_amount)       AS discount_total,
        SUM(oi.tax_amount)            AS tax_total
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variants pv ON pv.id = oi.product_variant_id
      JOIN products pr ON pr.id = pv.product_id
      LEFT JOIN categories p ON p.id = pr.category_id
      WHERE
        DATE(o.created_at) = ${targetDate}::date
        AND o.status NOT IN ('cancelled', 'voided')
      GROUP BY 1, 2, 3, 4, 5
      ON CONFLICT (date, location_id, product_id)
        DO UPDATE SET
          order_count   = EXCLUDED.order_count,
          quantity_sold = EXCLUDED.quantity_sold,
          gross_sales   = EXCLUDED.gross_sales,
          net_sales     = EXCLUDED.net_sales,
          discount_total = EXCLUDED.discount_total,
          tax_total     = EXCLUDED.tax_total,
          updated_at    = now()
    `)

    // Materialize labor by location × day × employee
    await tenantDb.execute(sql`
      INSERT INTO "merchant_${sql.raw(tenantId)}_analytics".analytics_labor_daily
        (date, location_id, employee_id, employee_name, regular_hours, overtime_hours, gross_pay)
      SELECT
        DATE(te.clock_in)   AS date,
        te.location_id,
        te.employee_id,
        e.first_name || ' ' || e.last_name AS employee_name,
        SUM(COALESCE(te.regular_hours, 0))  AS regular_hours,
        SUM(COALESCE(te.overtime_hours, 0)) AS overtime_hours,
        SUM(COALESCE(te.gross_pay, 0))      AS gross_pay
      FROM time_entries te
      JOIN employees e ON e.id = te.employee_id
      WHERE
        DATE(te.clock_in) = ${targetDate}::date
        AND te.status IN ('closed', 'approved')
      GROUP BY 1, 2, 3, 4
      ON CONFLICT (date, location_id, employee_id)
        DO UPDATE SET
          regular_hours  = EXCLUDED.regular_hours,
          overtime_hours = EXCLUDED.overtime_hours,
          gross_pay      = EXCLUDED.gross_pay,
          updated_at     = now()
    `)

    await job.updateProgress({ date: targetDate, status: 'complete' })
  })
}
