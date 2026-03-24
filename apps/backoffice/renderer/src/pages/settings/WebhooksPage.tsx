import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Trash2, ChevronRight, CheckCircle, XCircle, Clock } from 'lucide-react'
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
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
} from '../../hooks/use-settings'

// ─── Event Catalog ────────────────────────────────────────────────────────────

const EVENT_CATALOG = [
  { id: 'order.created', label: 'Order Created' },
  { id: 'order.updated', label: 'Order Updated' },
  { id: 'order.completed', label: 'Order Completed' },
  { id: 'order.voided', label: 'Order Voided' },
  { id: 'payment.captured', label: 'Payment Captured' },
  { id: 'payment.refunded', label: 'Payment Refunded' },
  { id: 'payment.failed', label: 'Payment Failed' },
  { id: 'customer.created', label: 'Customer Created' },
  { id: 'customer.updated', label: 'Customer Updated' },
  { id: 'product.created', label: 'Product Created' },
  { id: 'product.updated', label: 'Product Updated' },
  { id: 'inventory.low_stock', label: 'Low Stock Alert' },
  { id: 'loyalty.points_earned', label: 'Loyalty Points Earned' },
  { id: 'loyalty.redeemed', label: 'Loyalty Redemption' },
]

// ─── Schema ───────────────────────────────────────────────────────────────────

const webhookSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  secret: z.string().optional(),
})

type WebhookFormValues = z.infer<typeof webhookSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// ─── Deliveries Drawer ────────────────────────────────────────────────────────

function DeliveriesDrawer({
  endpointId,
  onClose,
}: {
  endpointId: string
  onClose: () => void
}) {
  const { data: deliveries = [], isLoading } = useWebhookDeliveries(endpointId)

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-900">Delivery Attempts</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">Loading…</div>
        ) : (deliveries as any[]).length === 0 ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            No deliveries yet
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {(deliveries as any[]).slice(0, 20).map((d: any) => (
              <div key={d.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {d.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-mono text-sm font-medium text-slate-700">
                      HTTP {d.statusCode}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {d.event}
                    </Badge>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    {fmtDate(d.createdAt)}
                  </span>
                </div>
                {d.error && (
                  <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-mono text-red-600">
                    {d.error}
                  </p>
                )}
                {d.durationMs && (
                  <p className="text-xs text-slate-400 mt-0.5">{d.durationMs}ms</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WebhooksPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [drawerEndpointId, setDrawerEndpointId] = useState<string | null>(null)
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])

  const { data: webhooks = [], isLoading } = useWebhooks()
  const createMutation = useCreateWebhook()
  const updateMutation = useUpdateWebhook()
  const deleteMutation = useDeleteWebhook()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WebhookFormValues>({ resolver: zodResolver(webhookSchema) })

  const openCreate = () => {
    reset()
    setSelectedEvents([])
    setEditTarget(null)
    setModalOpen(true)
  }

  const openEdit = (w: any) => {
    setEditTarget(w)
    setSelectedEvents(w.events ?? [])
    reset({ url: w.url, secret: '' })
    setModalOpen(true)
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId],
    )
  }

  const onSubmit = async (values: WebhookFormValues) => {
    const payload = { ...values, events: selectedEvents }
    if (editTarget) {
      await updateMutation.mutateAsync({ id: editTarget.id, ...payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    setModalOpen(false)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Webhooks</h1>
          <p className="text-sm text-slate-500">
            {(webhooks as any[]).length} endpoint{(webhooks as any[]).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Endpoint
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">URL</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Events</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Last Delivery</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Success Rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : (webhooks as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No webhook endpoints yet
                    </td>
                  </tr>
                ) : (
                  (webhooks as any[]).map((w) => {
                    const successRate = w.successRate ?? 0
                    return (
                      <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700 max-w-[200px] truncate">
                          {w.url}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(w.events ?? []).slice(0, 2).map((e: string) => (
                              <Badge key={e} variant="outline" className="text-xs">
                                {e}
                              </Badge>
                            ))}
                            {(w.events ?? []).length > 2 && (
                              <Badge variant="secondary" className="text-xs">
                                +{w.events.length - 2}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {w.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                              <CheckCircle className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-xs font-medium">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {fmtDate(w.lastDeliveryAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={
                              successRate >= 0.95
                                ? 'text-green-600'
                                : successRate >= 0.8
                                ? 'text-amber-600'
                                : 'text-red-600'
                            }
                          >
                            {(successRate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDrawerEndpointId(w.id)}
                              title="View deliveries"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(w)}
                              title="Edit"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setDeleteTarget(w)}
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Webhook' : 'Add Webhook Endpoint'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input id="wh-url" type="url" placeholder="https://example.com/webhooks" {...register('url')} />
              {errors.url && <p className="text-xs text-red-500">{errors.url.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-secret">Signing Secret (optional)</Label>
              <Input
                id="wh-secret"
                type="password"
                placeholder={editTarget ? 'Leave blank to keep existing' : 'Webhook secret'}
                {...register('secret')}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Events to send</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 max-h-60 overflow-y-auto">
                <label className="col-span-2 flex items-center gap-2 cursor-pointer select-none border-b border-slate-100 pb-2 mb-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={selectedEvents.length === EVENT_CATALOG.length}
                    onChange={() =>
                      setSelectedEvents(
                        selectedEvents.length === EVENT_CATALOG.length
                          ? []
                          : EVENT_CATALOG.map((e) => e.id),
                      )
                    }
                  />
                  <span className="text-sm font-medium text-slate-700">Select All</span>
                </label>
                {EVENT_CATALOG.map((event) => (
                  <label
                    key={event.id}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={selectedEvents.includes(event.id)}
                      onChange={() => toggleEvent(event.id)}
                    />
                    <span className="text-sm text-slate-700">{event.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || selectedEvents.length === 0}>
                {isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Endpoint'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Webhook</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Delete webhook endpoint{' '}
            <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">
              {deleteTarget?.url}
            </span>
            ? All delivery history will be lost.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deliveries Drawer */}
      {drawerEndpointId && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setDrawerEndpointId(null)}
          />
          <DeliveriesDrawer
            endpointId={drawerEndpointId}
            onClose={() => setDrawerEndpointId(null)}
          />
        </>
      )}
    </div>
  )
}
