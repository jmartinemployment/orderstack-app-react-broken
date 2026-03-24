import { useState } from 'react'
import { AlertTriangle, Download, Package } from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { useInventoryReport } from '../../hooks/use-reports'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function exportCsv(rows: { productName: string; variantName?: string; sku: string; quantityOnHand: number; estimatedValue: number; reorderPoint?: number; isLowStock: boolean }[]) {
  const headers = ['Item', 'SKU', 'On Hand', 'Est. Value', 'Reorder Point', 'Status']
  const data = rows.map((r) => [
    r.variantName ? `${r.productName} — ${r.variantName}` : r.productName,
    r.sku,
    r.quantityOnHand,
    r.estimatedValue,
    r.reorderPoint ?? '',
    r.quantityOnHand === 0 ? 'Out of Stock' : r.isLowStock ? 'Low Stock' : 'In Stock',
  ])
  const csv = [headers, ...data].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const STATUS_CLASSES: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  low: 'bg-amber-100 text-amber-700',
  out: 'bg-red-100 text-red-700',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InventoryReportPage() {
  const [locationId, setLocationId] = useState('')

  const { data: report, isLoading } = useInventoryReport({
    locationId: locationId || undefined,
  })

  const rows = report?.rows ?? []
  const totalValue = rows.reduce((s, r) => s + (r.estimatedValue ?? 0), 0)
  const lowStockCount = rows.filter((r) => r.isLowStock || r.quantityOnHand === 0).length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inventory Report</h1>
          <p className="text-sm text-slate-500">Valuation and stock status</p>
        </div>
        <Button variant="outline" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Location</Label>
          <Input
            placeholder="All locations"
            className="h-8 w-48 text-xs"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Loading…</div>
      ) : (
        <>
          {/* KPI */}
          <div className="flex flex-wrap gap-4">
            <Card className="flex-1 min-w-[180px]">
              <CardContent className="flex items-center gap-3 pt-5 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
                  <Package className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Inventory Value</p>
                  <p className="text-xl font-semibold text-slate-900">{fmt(totalValue)}</p>
                </div>
              </CardContent>
            </Card>
            {lowStockCount > 0 && (
              <Card className="flex-1 min-w-[180px] border-amber-200">
                <CardContent className="flex items-center gap-3 pt-5 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Low / Out of Stock Items</p>
                    <p className="text-xl font-semibold text-amber-700">{lowStockCount}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inventory Items ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Item</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">SKU</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">On Hand</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Unit Cost</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Value</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Reorder Pt.</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                          No inventory data
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => {
                        const isOut = r.quantityOnHand === 0
                        const isLow = r.isLowStock && !isOut
                        const statusKey = isOut ? 'out' : isLow ? 'low' : 'ok'
                        return (
                          <tr
                            key={r.variantId}
                            className={`border-b border-slate-100 hover:bg-slate-50 ${
                              r.isLowStock ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {r.isLowStock && (
                                <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-500" />
                              )}
                              {r.productName}
                              {r.variantName && (
                                <span className="text-slate-500 font-normal"> — {r.variantName}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-mono text-xs">{r.sku}</td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {r.quantityOnHand.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">—</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-900">
                              {fmt(r.estimatedValue)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {r.reorderPoint ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                                  STATUS_CLASSES[statusKey] ?? STATUS_CLASSES.ok
                                }`}
                              >
                                {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                        <td className="px-4 py-3 text-slate-700" colSpan={4}>
                          Total
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900">{fmt(totalValue)}</td>
                        <td colSpan={2} />
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
