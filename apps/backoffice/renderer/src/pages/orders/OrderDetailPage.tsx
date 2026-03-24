import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  AlertTriangle,
  X,
  Clock,
  CreditCard,
  User,
  ShoppingBag,
  Activity,
} from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@orderstack/ui'
import { useOrder, useVoidOrder, type OrderStatus, type OrderLineItem } from '../../hooks/use-orders'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function fmtCurrency(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<OrderStatus, string> = {
  pending: 'bg-blue-100 text-blue-700 border-blue-200',
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  ready: 'bg-green-100 text-green-700 border-green-200',
  completed: 'bg-slate-100 text-slate-600 border-slate-200',
  voided: 'bg-red-100 text-red-700 border-red-200',
  refunded: 'bg-red-100 text-red-700 border-red-200',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  ready: 'Ready',
  completed: 'Completed',
  voided: 'Voided',
  refunded: 'Refunded',
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Void dialog
// ---------------------------------------------------------------------------

const voidSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
})
type VoidForm = z.infer<typeof voidSchema>

function VoidOrderDialog({
  orderId,
  orderNumber,
  onClose,
}: {
  orderId: string
  orderNumber: string
  onClose: () => void
}) {
  const voidOrder = useVoidOrder()
  const { register, handleSubmit, formState: { errors } } = useForm<VoidForm>({
    resolver: zodResolver(voidSchema),
  })

  const onSubmit = (data: VoidForm) => {
    voidOrder.mutate({ id: orderId, reason: data.reason }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-red-500 mt-0.5 shrink-0" size={20} />
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Void Order #{orderNumber}</h2>
            <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason for voiding</Label>
            <Input
              id="void-reason"
              placeholder="e.g. Customer cancelled order"
              {...register('reason')}
            />
            {errors.reason && (
              <p className="text-xs text-red-500">{errors.reason.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={voidOrder.isPending}>
              {voidOrder.isPending ? 'Voiding…' : 'Void Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Line item row
// ---------------------------------------------------------------------------

function LineItemRow({ item }: { item: OrderLineItem }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{item.name}</p>
        {item.modifiers.length > 0 && (
          <p className="text-xs text-slate-500 mt-0.5">
            {item.modifiers.map((m) => m.name).join(', ')}
          </p>
        )}
        {item.notes && (
          <p className="text-xs text-amber-600 mt-0.5 italic">Note: {item.notes}</p>
        )}
      </td>
      <td className="px-4 py-3 text-right text-slate-600">{item.quantity}</td>
      <td className="px-4 py-3 text-right text-slate-600">{fmtCurrency(item.unitPrice)}</td>
      <td className="px-4 py-3 text-right font-medium text-slate-900">
        {fmtCurrency(item.subtotal)}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [voidOpen, setVoidOpen] = useState(false)

  const { data: order, isLoading, isError } = useOrder(id ?? '')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading order…
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">Failed to load order.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
      </div>
    )
  }

  const canVoid = order.status !== 'voided' && order.status !== 'refunded' && order.status !== 'completed'

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back button + header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Order #{order.orderNumber}</h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {order.orderType.replace('_', ' ')} &middot; Created {fmt(order.createdAt)}
            </p>
          </div>
        </div>
        {canVoid && (
          <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
            Void Order
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT: items + totals */}
        <div className="lg:col-span-2 space-y-5">
          {/* Order items */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-slate-400" />
                <CardTitle className="text-sm">Order Items</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-3 px-0 pb-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {['Item', 'Qty', 'Unit Price', 'Total'].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide ${h !== 'Item' ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.lineItems.map((item) => (
                    <LineItemRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border-t border-slate-100 px-4 py-4 space-y-2">
                {[
                  { label: 'Subtotal', value: fmtCurrency(order.subtotal) },
                  { label: 'Discount', value: `-${fmtCurrency(order.discountAmount)}` },
                  { label: 'Tax', value: fmtCurrency(order.taxAmount) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm text-slate-600">
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span>{fmtCurrency(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit trail */}
          {(order.voidedAt ?? order.voidReason) && (
            <Card>
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-slate-400" />
                  <CardTitle className="text-sm">Audit Trail</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="space-y-3">
                  {order.voidedAt && (
                    <div className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium text-slate-900">Order Voided</p>
                        <p className="text-slate-500 text-xs">{fmt(order.voidedAt)}</p>
                        {order.voidReason && (
                          <p className="text-slate-600 mt-0.5">Reason: {order.voidReason}</p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-medium text-slate-900">Order Created</p>
                      <p className="text-slate-500 text-xs">{fmt(order.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT: sidebar */}
        <div className="space-y-4">
          {/* Order info */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                <CardTitle className="text-sm">Order Info</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-3 text-sm">
              {[
                { label: 'Order #', value: `#${order.orderNumber}` },
                { label: 'Type', value: order.orderType.replace('_', ' ') },
                { label: 'Location', value: order.locationId },
                { label: 'Created', value: fmt(order.createdAt) },
                { label: 'Updated', value: fmt(order.updatedAt) },
                ...(order.completedAt ? [{ label: 'Completed', value: fmt(order.completedAt) }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">{label}</span>
                  <span className="text-slate-900 text-right capitalize">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Customer */}
          {order.customerId && (
            <Card>
              <CardHeader className="pb-0">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-slate-400" />
                  <CardTitle className="text-sm">Customer</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-3 text-sm">
                <p className="text-sky-600 font-medium">{order.customerId}</p>
              </CardContent>
            </Card>
          )}

          {/* Payment — placeholder since Order type doesn't carry payment history */}
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-slate-400" />
                <CardTitle className="text-sm">Payment</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-semibold text-slate-900">{fmtCurrency(order.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <StatusBadge status={order.status} />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-slate-600 italic">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Void dialog */}
      {voidOpen && (
        <VoidOrderDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          onClose={() => setVoidOpen(false)}
        />
      )}
    </div>
  )
}
