import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  BarChart2,
  PieChart,
  Users,
  Package,
  CreditCard,
  Download,
  Calendar,
} from 'lucide-react'
import { Button, Input, Label, Card, CardContent } from '@orderstack/ui'

// ─── Report Card Config ───────────────────────────────────────────────────────

interface ReportCard {
  icon: React.ElementType
  title: string
  description: string
  path: string
  color: string
}

const REPORTS: ReportCard[] = [
  {
    icon: BarChart2,
    title: 'Sales Summary',
    description: 'Gross sales, net sales, order count, AOV, and tax collected by period.',
    path: '/reports/sales',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    icon: PieChart,
    title: 'Product Mix',
    description: 'Item-level breakdown of quantity sold, revenue, and percentage of total sales.',
    path: '/reports/product-mix',
    color: 'text-purple-600 bg-purple-50',
  },
  {
    icon: Users,
    title: 'Labor Report',
    description: 'Employee hours, regular vs overtime, gross pay, and labor cost percentage.',
    path: '/reports/labor',
    color: 'text-amber-600 bg-amber-50',
  },
  {
    icon: Package,
    title: 'Inventory Valuation',
    description: 'Current on-hand quantities, unit costs, and total inventory value by location.',
    path: '/reports/inventory',
    color: 'text-green-600 bg-green-50',
  },
  {
    icon: CreditCard,
    title: 'Payment Methods',
    description: 'Transaction volume and amounts broken down by payment method and status.',
    path: '/reports/sales',
    color: 'text-rose-600 bg-rose-50',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const navigate = useNavigate()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleExportAll = () => {
    // Trigger exports for all reports with current date range
    // Each individual report page handles its own export; here we just navigate
    alert('Navigate to each report to export individually, or use the accounting GL export.')
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Analytics and business intelligence</p>
        </div>
        <Button variant="outline" onClick={handleExportAll}>
          <Download className="mr-2 h-4 w-4" /> Export All
        </Button>
      </div>

      {/* Quick Date Range Selector */}
      <div className="flex items-end gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Calendar className="h-5 w-5 text-slate-400 mb-1" />
        <div className="flex flex-col gap-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex gap-2 mb-px">
          {[
            { label: 'Today', days: 0 },
            { label: '7d', days: 7 },
            { label: '30d', days: 30 },
            { label: '90d', days: 90 },
          ].map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                const to = new Date()
                const from = new Date()
                from.setDate(from.getDate() - days)
                setDateTo(to.toISOString().slice(0, 10))
                setDateFrom(from.toISOString().slice(0, 10))
              }}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon
          return (
            <Card key={report.path + report.title} className="flex flex-col hover:shadow-md transition-shadow">
              <CardContent className="flex flex-col gap-4 pt-6 flex-1">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${report.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold text-slate-900">{report.title}</h3>
                  <p className="text-sm text-slate-500">{report.description}</p>
                </div>
                <div className="mt-auto">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `${report.path}${
                          dateFrom || dateTo
                            ? `?dateFrom=${dateFrom}&dateTo=${dateTo}`
                            : ''
                        }`,
                      )
                    }
                  >
                    View Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
