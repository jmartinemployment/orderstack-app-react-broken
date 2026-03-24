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
  Legend,
} from 'recharts'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { useEmployeesReport } from '../../hooks/use-reports'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pct(n: number) {
  return `${n.toFixed(1)}%`
}

function exportCsv(rows: any[]) {
  const headers = ['Employee', 'Regular Hrs', 'OT Hrs', 'Gross Pay', 'Labor %']
  const data = rows.map((r) => [
    r.employeeName,
    r.regularHours,
    r.overtimeHours,
    r.grossPay,
    r.laborPct,
  ])
  const csv = [headers, ...data].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `labor-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LaborReportPage() {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [locationId, setLocationId] = useState('')

  const { data: report, isLoading } = useEmployeesReport({
    dateFrom,
    dateTo,
    locationId: locationId || undefined,
  })

  const rows = report?.rows ?? []

  // Derive summary totals from rows — hoursWorked is used as a proxy for regularHours
  const summary = {
    totalHours: rows.reduce((s, r) => s + (r.hoursWorked ?? 0), 0),
    regularHours: rows.reduce((s, r) => s + (r.hoursWorked ?? 0), 0),
    overtimeHours: 0,
    totalGrossPay: 0, // gross pay not in employees report
    laborPct: 0,
  }

  // Alias for backwards compat with template
  const employees = rows.map((r) => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    regularHours: r.hoursWorked ?? 0,
    overtimeHours: 0,
    grossPay: 0,
    laborPct: 0,
  }))
  const dailyChart: { date: string; laborCost: number }[] = []

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Labor Report</h1>
          <p className="text-sm text-slate-500">Employee hours and payroll cost</p>
        </div>
        <Button
          variant="outline"
          onClick={() => exportCsv(employees)}
          disabled={employees.length === 0}
        >
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
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <KpiCard label="Total Hours" value={`${(summary?.totalHours ?? 0).toFixed(1)} h`} />
            <KpiCard label="Regular Hours" value={`${(summary?.regularHours ?? 0).toFixed(1)} h`} />
            <KpiCard label="OT Hours" value={`${(summary?.overtimeHours ?? 0).toFixed(1)} h`} />
            <KpiCard label="Total Gross Pay" value={fmt(summary?.totalGrossPay ?? 0)} />
            <KpiCard label="Labor %" value={pct(summary?.laborPct ?? 0)} />
          </div>

          {/* Bar Chart */}
          {dailyChart.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Labor Cost by Day</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailyChart} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(v: number) => [fmt(v), 'Labor Cost']} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="laborCost" name="Labor Cost" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Employee Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employee Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Employee</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Regular Hrs</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">OT Hrs</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Gross Pay</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Labor %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                          No data for this period
                        </td>
                      </tr>
                    ) : (
                      employees.map((e: any) => (
                        <tr key={e.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{e.employeeName}</td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {e.regularHours.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {e.overtimeHours.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {fmt(e.grossPay)}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">
                            {pct(e.laborPct)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {employees.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                        <td className="px-4 py-3 text-slate-700">Total</td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {(summary?.regularHours ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {(summary?.overtimeHours ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {fmt(summary?.totalGrossPay ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900">
                          {pct(summary?.laborPct ?? 0)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
