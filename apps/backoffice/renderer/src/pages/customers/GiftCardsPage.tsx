import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Badge,
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
  useGiftCards,
  useCreateGiftCard,
  useReloadGiftCard,
  useUpdateGiftCard,
} from '../../../hooks/use-customers'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  customerId: z.string().optional(),
  expiresAt: z.string().optional(),
})

const reloadSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
})

type CreateFormValues = z.infer<typeof createSchema>
type ReloadFormValues = z.infer<typeof reloadSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  redeemed: { label: 'Redeemed', className: 'bg-slate-100 text-slate-600' },
  expired: { label: 'Expired', className: 'bg-red-100 text-red-700' },
  inactive: { label: 'Inactive', className: 'bg-amber-100 text-amber-700' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GiftCardsPage() {
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [reloadTarget, setReloadTarget] = useState<any | null>(null)

  const { data, isLoading } = useGiftCards({ page, limit: 25 })
  const createMutation = useCreateGiftCard()
  const reloadMutation = useReloadGiftCard()
  const updateMutation = useUpdateGiftCard()

  const {
    register: regCreate,
    handleSubmit: submitCreate,
    reset: resetCreate,
    formState: { errors: createErrors, isSubmitting: creating },
  } = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) })

  const {
    register: regReload,
    handleSubmit: submitReload,
    reset: resetReload,
    formState: { errors: reloadErrors, isSubmitting: reloading },
  } = useForm<ReloadFormValues>({ resolver: zodResolver(reloadSchema) })

  const onCreateSubmit = async (values: CreateFormValues) => {
    await createMutation.mutateAsync(values)
    resetCreate()
    setCreateOpen(false)
  }

  const onReloadSubmit = async (values: ReloadFormValues) => {
    if (!reloadTarget) return
    await reloadMutation.mutateAsync({ id: reloadTarget.id, amount: values.amount })
    resetReload()
    setReloadTarget(null)
  }

  const toggleStatus = async (card: any) => {
    await updateMutation.mutateAsync({
      id: card.id,
      status: card.status === 'active' ? 'inactive' : 'active',
    })
  }

  const cards = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 25)

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Gift Cards</h1>
          <p className="text-sm text-slate-500">{total.toLocaleString()} total</p>
        </div>
        <Button onClick={() => { resetCreate(); setCreateOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" /> Issue Gift Card
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Code</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Initial Balance</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Current Balance</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Purchased By</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Expires</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : cards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      No gift cards found
                    </td>
                  </tr>
                ) : (
                  cards.map((card: any) => {
                    const statusInfo = STATUS_BADGE[card.status] ?? STATUS_BADGE.inactive
                    return (
                      <tr key={card.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700 font-medium">
                          {card.code}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {fmt(card.initialBalance)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {fmt(card.currentBalance)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {card.purchasedByName ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(card.expiresAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { resetReload(); setReloadTarget(card) }}
                              disabled={card.status !== 'active'}
                            >
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reload
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleStatus(card)}
                              disabled={updateMutation.isPending}
                            >
                              {card.status === 'active' ? (
                                <ToggleRight className="mr-1.5 h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="mr-1.5 h-4 w-4 text-slate-400" />
                              )}
                              {card.status === 'active' ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
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

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue New Gift Card</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate(onCreateSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gc-amount">Amount ($)</Label>
              <Input id="gc-amount" type="number" step="0.01" min="0.01" {...regCreate('amount')} />
              {createErrors.amount && (
                <p className="text-xs text-red-500">{createErrors.amount.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gc-customer">Customer ID (optional)</Label>
              <Input id="gc-customer" placeholder="cus_…" {...regCreate('customerId')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gc-expiry">Expiry Date (optional)</Label>
              <Input id="gc-expiry" type="date" {...regCreate('expiresAt')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Issuing…' : 'Issue Gift Card'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reload Modal */}
      <Dialog open={Boolean(reloadTarget)} onOpenChange={(v) => { if (!v) setReloadTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reload Gift Card</DialogTitle>
          </DialogHeader>
          {reloadTarget && (
            <div className="mb-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="font-mono font-medium">{reloadTarget.code}</span>
              <span className="ml-3 text-slate-500">
                Current balance: {fmt(reloadTarget.currentBalance)}
              </span>
            </div>
          )}
          <form onSubmit={submitReload(onReloadSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reload-amount">Reload Amount ($)</Label>
              <Input id="reload-amount" type="number" step="0.01" min="0.01" {...regReload('amount')} />
              {reloadErrors.amount && (
                <p className="text-xs text-red-500">{reloadErrors.amount.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReloadTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={reloading}>
                {reloading ? 'Reloading…' : 'Reload Card'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
