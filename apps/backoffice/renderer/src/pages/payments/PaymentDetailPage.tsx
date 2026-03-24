import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, CreditCard, RotateCcw, ExternalLink } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@orderstack/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import { usePayment, useRefundPayment } from '../../../hooks/use-payments'

// ─── Schema ───────────────────────────────────────────────────────────────────

const refundSchema = z.object({
  amount: z.coerce.number().positive('Must be positive'),
  reason: z.string().min(1, 'Reason is required'),
})

type RefundFormValues = z.infer<typeof refundSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const STATUS_CLASSES: Record<string, string> = {
  captured: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-orange-100 text-orange-700',
  pending: 'bg-amber-100 text-amber-700',
  partially_refunded: 'bg-orange-100 text-orange-700',
  voided: 'bg-slate-100 text-slate-600',
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [refundOpen, setRefundOpen] = useState(false)

  const { data: payment, isLoading } = usePayment(id ?? '')
  const refundMutation = useRefundPayment()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RefundFormValues>({ resolver: zodResolver(refundSchema) })

  const onRefundSubmit = async (values: RefundFormValues) => {
    await refundMutation.mutateAsync({ id: id!, ...values })
    setRefundOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>
    )
  }

  if (!payment) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Payment not found.</p>
        <Button variant="outline" onClick={() => navigate('/payments')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    )
  }

  const statusCls = STATUS_CLASSES[payment.status] ?? 'bg-slate-100 text-slate-600'
  const refunds = payment.refunds ?? []
  const totalRefunded = refunds.reduce((s: number, r: any) => s + r.amount, 0)
  const canRefund =
    payment.status === 'captured' ||
    (payment.status === 'partially_refunded' && totalRefunded < payment.amount)

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => navigate('/payments')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 w-fit"
      >
        <ArrowLeft className="h-4 w-4" /> All Payments
      </button>

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payment Detail</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">{payment.id}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize ${statusCls}`}
        >
          {payment.status?.replace('_', ' ')}
        </span>
      </div>

      {/* Payment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Payment Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Amount" value={fmt(payment.amount)} />
          {payment.tip > 0 && <InfoRow label="Tip" value={fmt(payment.tip)} />}
          <InfoRow label="Method" value={payment.method?.replace('_', ' ')} />
          <InfoRow label="Processor" value={payment.processor ?? '—'} />
          {payment.card && (
            <>
              <InfoRow
                label="Card Brand"
                value={
                  <span className="capitalize">{payment.card.brand}</span>
                }
              />
              <InfoRow label="Last 4" value={`•••• ${payment.card.last4}`} />
            </>
          )}
          <InfoRow label="Date" value={fmtDate(payment.createdAt)} />
          {payment.orderId && (
            <InfoRow
              label="Order"
              value={
                <Link
                  to={`/orders/${payment.orderId}`}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  {payment.orderNumber ?? payment.orderId}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Refunds */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Refunds</CardTitle>
          {canRefund && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                reset({ reason: '' })
                setRefundOpen(true)
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Initiate Refund
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {refunds.length === 0 ? (
            <p className="px-6 py-6 text-sm text-slate-400">No refunds for this payment.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
                      {fmt(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.reason}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-4 py-2 text-sm font-medium text-slate-600" colSpan={2}>
                    Total Refunded
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-red-600" colSpan={2}>
                    {fmt(totalRefunded)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Refund Modal */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Initiate Refund</DialogTitle>
          </DialogHeader>
          <div className="mb-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Max refundable:{' '}
            <span className="font-medium">{fmt(payment.amount - totalRefunded)}</span>
          </div>
          <form onSubmit={handleSubmit(onRefundSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rd-amount">Amount ($)</Label>
              <Input
                id="rd-amount"
                type="number"
                step="0.01"
                max={payment.amount - totalRefunded}
                {...register('amount')}
              />
              {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rd-reason">Reason</Label>
              <Input id="rd-reason" {...register('reason')} />
              {errors.reason && <p className="text-xs text-red-500">{errors.reason.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Processing…' : 'Submit Refund'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
