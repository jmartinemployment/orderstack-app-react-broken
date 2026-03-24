import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, AlertTriangle, X, PackageCheck } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@orderstack/ui'
import {
  usePurchaseOrder,
  useReceivePurchaseOrder,
  type PurchaseOrderStatus,
  type PurchaseOrderLineItem,
} from '../../hooks/use-inventory'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function fmtCurrency(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  partial: { label: 'Partially Received', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  received: { label: 'Received', className: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 border-red-200' },
}

function POStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Receive modal
// ---------------------------------------------------------------------------

function ReceiveModal({
  poId,
  lineItems,
  onClose,
}: {
  poId: string
  lineItems: PurchaseOrderLineItem[]
  onClose: () => void
}) {
  const receivePO = useReceivePurchaseOrder()
  const [qtys, setQtys] = useState<Record<string, string>>(
    Object.fromEntries(lineItems.map((li) => [li.id, String(li.orderedQuantity - li.receivedQuantity)])),
  )

  const handleSubmit = () => {
    receivePO.mutate(
      {
        id: poId,
        lineItems: lineItems.map((li) => ({
          lineItemId: li.id,
          receivedQuantity: parseInt(qtys[li.id] ?? '0', 10),
        })),
      },
      { onSuccess: onClose },
    )
  }

  const discrepancies = lineItems.filter((li) => {
    const received = parseInt(qtys[li.id] ?? '0', 10)
    const remaining = li.orderedQuantity - li.receivedQuantity
    return !isNaN(received) && received < remaining
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-green-600" />
            <h2 className="text-base font-semibold text-slate-900">Receive Items</h2>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {discrepancies.length > 0 && (
            <div className="flex gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Discrepancies detected</p>
                <p className="text-xs mt-0.5">
                  {discrepancies.map((li) => li.name).join(', ')} will be partially received.
                </p>
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Item', 'Ordered', 'Already Received', 'Receiving Now'].map((h) => (
                  <th
                    key={h}
                    className="pb-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineItems.map((li) => {
                const remaining = li.orderedQuantity - li.receivedQuantity
                const val = qtys[li.id] ?? ''
                const received = parseInt(val, 10)
                const isDiscrepancy = !isNaN(received) && received < remaining

                return (
                  <tr key={li.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900">{li.name}</p>
                      <p className="text-xs text-slate-500">{li.sku}</p>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{li.orderedQuantity}</td>
                    <td className="py-3 pr-4 text-slate-600">{li.receivedQuantity}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          className={`w-24 ${isDiscrepancy ? 'border-yellow-400 focus-visible:ring-yellow-400' : ''}`}
                          value={val}
                          onChange={(e) =>
                            setQtys((prev) => ({ ...prev, [li.id]: e.target.value }))
                          }
                        />
                        {isDiscrepancy && (
                          <span className="text-xs text-yellow-600 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            Short
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={receivePO.isPending}>
            {receivePO.isPending ? 'Saving…' : 'Confirm Receipt'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [receiveOpen, setReceiveOpen] = useState(false)

  const { data: po, isLoading, isError } = usePurchaseOrder(id ?? '')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading purchase order…
      </div>
    )
  }

  if (isError || !po) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">Failed to load purchase order.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
      </div>
    )
  }

  const canReceive = po.status !== 'received' && po.status !== 'cancelled'

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">PO {po.poNumber}</h1>
              <POStatusBadge status={po.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Vendor: {po.vendorId} &middot; Location: {po.locationId} &middot; Expected:{' '}
              {fmt(po.expectedAt)}
            </p>
          </div>
        </div>
        {canReceive && (
          <Button onClick={() => setReceiveOpen(true)}>
            <PackageCheck size={15} className="mr-1.5" />
            Receive Items
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Subtotal</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{fmtCurrency(po.subtotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Tax</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{fmtCurrency(po.taxAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{fmtCurrency(po.total)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Line items table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Item', 'SKU', 'Ordered', 'Received', 'Remaining', 'Unit Cost', 'Total'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {po.lineItems.map((li) => {
                  const remaining = li.orderedQuantity - li.receivedQuantity
                  const hasDiscrepancy = li.receivedQuantity > 0 && remaining > 0
                  return (
                    <tr
                      key={li.id}
                      className={hasDiscrepancy ? 'bg-yellow-50' : ''}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{li.name}</td>
                      <td className="px-4 py-3 text-slate-500">{li.sku}</td>
                      <td className="px-4 py-3 text-slate-700">{li.orderedQuantity}</td>
                      <td className="px-4 py-3 text-slate-700">{li.receivedQuantity}</td>
                      <td className="px-4 py-3">
                        {remaining > 0 ? (
                          <span className="text-yellow-700 font-medium flex items-center gap-1">
                            <AlertTriangle size={12} />
                            {remaining}
                          </span>
                        ) : (
                          <span className="text-green-600 font-medium">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtCurrency(li.unitCost)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{fmtCurrency(li.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={6} className="px-4 py-3 text-right font-semibold text-slate-700">
                    Total
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {fmtCurrency(po.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {po.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-slate-600">{po.notes}</p>
          </CardContent>
        </Card>
      )}

      {receiveOpen && po.lineItems && (
        <ReceiveModal
          poId={po.id}
          lineItems={po.lineItems}
          onClose={() => setReceiveOpen(false)}
        />
      )}
    </div>
  )
}
