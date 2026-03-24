import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { useSalesReport } from '../../hooks/use-reports'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function exportCsv(rows: any[]) {
  const headers = ['Period', 'Gross Sales', 'Net Sales', 'Orders', 'AOV', 'Tax']
  const data = rows.map((r) => [r.period, r.grossSales, r.netSales, r.orderCount, r.averageOrderValue, r.tax])
  const csv = [headers, ...data].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesReportPage() {
  const [searchParams] = useSearchParams()
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') ?? today)
  const [locationId, setLocationId] = useState('')
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')

  const { data: report, isLoading } = useSalesReport({ dateFrom, dateTo, locationId: locationId || undefined, groupBy })

  const rows = report?.rows ?? []
  const summary = report?.summary

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sales Report</h1>
          <p className="text-sm text-slate-500">Revenue and order analytics</p>
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
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Group By</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Loading…</div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <KpiCard label="Gross Sales" value={fmt(summary?.grossSales ?? 0)} />
            <KpiCard label="Net Sales" value={fmt(summary?.netSales ?? 0)} />
            <KpiCard label="Orders" value={(summary?.orderCount ?? 0).toLocaleString()} />
            <KpiCard label="Avg Order Value" value={fmt(summary?.averageOrderValue ?? 0)} />
            <KpiCard label="Tax Collected" value={fmt(summary?.tax ?? 0)} />
          </div>

          {/* Line Chart */}
          {rows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gross Sales Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={rows} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value: number) => [fmt(value), '']}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="grossSales"
                      name="Gross Sales"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="netSales"
                      name="Net Sales"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Breakdown by {groupBy}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Period</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Gross Sales</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Net Sales</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Orders</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">AOV</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Tax</th>
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
                        <tr key={r.period} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-700 font-medium">{r.period}</td>
                          <td className="px-4 py-3 text-right text-slate-900">{fmt(r.grossSales)}</td>
                          <td className="px-4 py-3 text-right text-slate-900">{fmt(r.netSales)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{r.orderCount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{fmt(r.averageOrderValue)}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{fmt(r.tax)}</td>
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
