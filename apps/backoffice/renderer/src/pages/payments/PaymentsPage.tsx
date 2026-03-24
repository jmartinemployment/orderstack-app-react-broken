import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download, RotateCcw, Filter } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
} from '@orderstack/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { usePayments, useRefundPayment } from '../../../hooks/use-payments'

// ─── Schema ───────────────────────────────────────────────────────────────────

const refundSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  reason: z.string().min(1, 'Reason is required'),
})

type RefundFormValues = z.infer<typeof refundSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(iso: string) {
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

function exportCsv(payments: any[]) {
  const headers = ['Date', 'Order #', 'Customer', 'Method', 'Amount', 'Tip', 'Status']
  const rows = payments.map((p) => [
    fmtDate(p.createdAt),
    p.orderNumber ?? '',
    p.customerName ?? '',
    p.method,
    p.amount,
    p.tip ?? 0,
    p.status,
  ])
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [locationId, setLocationId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [refundTarget, setRefundTarget] = useState<any | null>(null)

  const { data, isLoading } = usePayments({
    page,
    limit: 25,
    locationId: locationId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    method: method || undefined,
    status: status || undefined,
  })

  const refundMutation = useRefundPayment()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RefundFormValues>({ resolver: zodResolver(refundSchema) })

  const payments = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  // Summary
  const totalCaptured = payments
    .filter((p: any) => p.status === 'captured' || p.status === 'partially_refunded')
    .reduce((s: number, p: any) => s + p.amount, 0)
  const totalTips = payments.reduce((s: number, p: any) => s + (p.tip ?? 0), 0)
  const totalRefunds = payments
    .filter((p: any) => p.status === 'refunded' || p.status === 'partially_refunded')
    .reduce((s: number, p: any) => s + (p.refundedAmount ?? 0), 0)

  const onRefundSubmit = async (values: RefundFormValues) => {
    if (!refundTarget) return
    await refundMutation.mutateAsync({
      id: refundTarget.id,
      amount: values.amount,
      reason: values.reason,
    })
    setRefundTarget(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500">{total.toLocaleString()} transactions</p>
        </div>
        <Button variant="outline" onClick={() => exportCsv(payments)}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Location</Label>
          <Input
            placeholder="Location ID"
            className="h-8 w-36 text-xs"
            value={locationId}
            onChange={(e) => { setLocationId(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 text-xs"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Method</Label>
          <Select onValueChange={(v) => { setMethod(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="gift_card">Gift Card</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <Select onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="captured">Captured</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Row */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Total Captured</p>
          <p className="text-lg font-semibold text-slate-900">{fmt(totalCaptured)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Total Tips</p>
          <p className="text-lg font-semibold text-slate-900">{fmt(totalTips)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Total Refunds</p>
          <p className="text-lg font-semibold text-red-600">{fmt(totalRefunds)}</p>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Order #</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Customer</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Method</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Tip</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  payments.map((p: any) => {
                    const statusCls = STATUS_CLASSES[p.status] ?? 'bg-slate-100 text-slate-600'
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => navigate(`/payments/${p.id}`)}
                      >
                        <td className="px-4 py-3 text-slate-600">{fmtDate(p.createdAt)}</td>
                        <td className="px-4 py-3 font-mono text-slate-700">{p.orderNumber ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{p.customerName ?? '—'}</td>
                        <td className="px-4 py-3 capitalize text-slate-600">
                          {p.method?.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {fmt(p.amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {p.tip ? fmt(p.tip) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusCls}`}
                          >
                            {p.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {p.status === 'captured' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                reset({ reason: '' })
                                setRefundTarget(p)
                              }}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Refund
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <p className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Refund Modal */}
      <Dialog
        open={Boolean(refundTarget)}
        onOpenChange={(v) => { if (!v) setRefundTarget(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Initiate Refund</DialogTitle>
          </DialogHeader>
          {refundTarget && (
            <div className="mb-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-500">
                Order: <span className="font-mono font-medium">{refundTarget.orderNumber}</span>
              </p>
              <p className="text-slate-500">
                Max refundable: <span className="font-medium">{fmt(refundTarget.amount)}</span>
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit(onRefundSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-amount">Refund Amount ($)</Label>
              <Input
                id="r-amount"
                type="number"
                step="0.01"
                max={refundTarget?.amount}
                {...register('amount')}
              />
              {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-reason">Reason</Label>
              <Input id="r-reason" placeholder="e.g. Customer request" {...register('reason')} />
              {errors.reason && <p className="text-xs text-red-500">{errors.reason.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRefundTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Processing…' : 'Refund'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
