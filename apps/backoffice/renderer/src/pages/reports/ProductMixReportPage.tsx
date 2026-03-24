import { useState } from 'react'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { useProductsReport } from '../../hooks/use-reports'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function exportCsv(rows: any[]) {
  const headers = ['Product', 'Category', 'Qty Sold', 'Revenue', '% of Total', 'Avg Price']
  const data = rows.map((r) => [
    r.productName,
    r.categoryName,
    r.qtySold,
    r.revenue,
    r.pctOfTotal,
    r.avgPrice,
  ])
  const csv = [headers, ...data].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `product-mix-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#be185d', '#65a30d', '#ea580c', '#0f766e',
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductMixReportPage() {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [locationId, setLocationId] = useState('')

  const { data: report, isLoading } = useProductsReport({
    dateFrom,
    dateTo,
    locationId: locationId || undefined,
  })

  const rawRows = report?.rows ?? []
  // Derive total revenue for pct calculation
  const totalRevenue = rawRows.reduce((s, r) => s + (r.grossSales ?? 0), 0)
  const rows = rawRows.map((r) => ({
    ...r,
    revenue: r.grossSales,
    qtySold: r.quantitySold,
    pctOfTotal: totalRevenue > 0 ? (r.grossSales / totalRevenue) * 100 : 0,
    avgPrice: r.quantitySold > 0 ? r.grossSales / r.quantitySold : 0,
  }))
  const top10 = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Product Mix Report</h1>
          <p className="text-sm text-slate-500">Item sales breakdown</p>
        </div>
        <Button variant="outline" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Location</Label>
          <Input
            placeholder="All locations"
            className="h-8 w-36 text-xs"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Loading…</div>
      ) : (
        <>
          {/* Bar Chart — Top 10 */}
          {top10.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Products by Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={top10}
                    layout="vertical"
                    margin={{ top: 4, right: 24, bottom: 4, left: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="productName"
                      tick={{ fontSize: 11 }}
                      width={115}
                    />
                    <Tooltip formatter={(v: number) => [fmt(v), 'Revenue']} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {top10.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Products ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Category</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Qty Sold</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Revenue</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">% of Total</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Avg Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                          No data for this period
                        </td>
                      </tr>
                    ) : (
                      rows.map((r: any) => (
                        <tr key={r.productId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{r.productName}</td>
                          <td className="px-4 py-3 text-slate-600">{r.categoryName ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {r.qtySold.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {fmt(r.revenue)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {r.pctOfTotal.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {fmt(r.avgPrice)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
