import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Tag } from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  useDiscounts,
  useCreateDiscount,
  useUpdateDiscount,
  useDeleteDiscount,
} from '../../../hooks/use-customers'

// ─── Schema ───────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const discountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['percentage', 'fixed', 'bogo', 'combo', 'free_item']),
  value: z.coerce.number().nonneg('Value must be non-negative'),
  scope: z.enum(['order', 'item', 'category']).default('order'),
  code: z.string().optional(),
  maxUses: z.coerce.number().int().nonneg().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  daysOfWeek: z.array(z.string()).optional(),
  applicableProductIds: z.string().optional(),
  applicableCategoryIds: z.string().optional(),
})

type DiscountFormValues = z.infer<typeof discountSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

function fmtValue(type: string, value: number) {
  if (type === 'percentage') return `${value}%`
  if (type === 'fixed') return `$${value.toFixed(2)}`
  return type.replace('_', ' ')
}

const TYPE_LABELS: Record<string, string> = {
  percentage: 'Percentage',
  fixed: 'Fixed Amount',
  bogo: 'BOGO',
  combo: 'Combo',
  free_item: 'Free Item',
}

const STATUS_CLASSES = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-600',
  expired: 'bg-red-100 text-red-700',
  scheduled: 'bg-amber-100 text-amber-700',
}

function discountStatus(d: any): keyof typeof STATUS_CLASSES {
  if (!d.isActive) return 'inactive'
  const now = new Date()
  if (d.endsAt && new Date(d.endsAt) < now) return 'expired'
  if (d.startsAt && new Date(d.startsAt) > now) return 'scheduled'
  return 'active'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiscountsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [selectedDays, setSelectedDays] = useState<string[]>([])

  const { data: discounts = [], isLoading } = useDiscounts()
  const createMutation = useCreateDiscount()
  const updateMutation = useUpdateDiscount()
  const deleteMutation = useDeleteDiscount()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DiscountFormValues>({
    resolver: zodResolver(discountSchema),
    defaultValues: { type: 'percentage', scope: 'order', daysOfWeek: [] },
  })

  const watchType = watch('type', 'percentage')

  const openCreate = () => {
    reset({ type: 'percentage', scope: 'order', daysOfWeek: [] })
    setSelectedDays([])
    setEditTarget(null)
    setModalOpen(true)
  }

  const openEdit = (d: any) => {
    setEditTarget(d)
    const days = d.daysOfWeek ?? []
    setSelectedDays(days)
    reset({
      name: d.name,
      type: d.type,
      value: d.value,
      scope: d.scope ?? 'order',
      code: d.code ?? '',
      maxUses: d.maxUses ?? 0,
      startsAt: d.startsAt ? d.startsAt.slice(0, 10) : '',
      endsAt: d.endsAt ? d.endsAt.slice(0, 10) : '',
      daysOfWeek: days,
      applicableProductIds: (d.applicableProductIds ?? []).join(', '),
      applicableCategoryIds: (d.applicableCategoryIds ?? []).join(', '),
    })
    setModalOpen(true)
  }

  const toggleDay = (day: string) => {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day]
    setSelectedDays(next)
    setValue('daysOfWeek', next)
  }

  const onSubmit = async (values: DiscountFormValues) => {
    const payload = {
      ...values,
      daysOfWeek: selectedDays,
      applicableProductIds: values.applicableProductIds
        ? values.applicableProductIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      applicableCategoryIds: values.applicableCategoryIds
        ? values.applicableCategoryIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    }
    if (editTarget) {
      await updateMutation.mutateAsync({ id: editTarget.id, ...payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    setModalOpen(false)
  }

  const toggleActive = async (d: any) => {
    await updateMutation.mutateAsync({ id: d.id, isActive: !d.isActive })
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
          <h1 className="text-2xl font-semibold text-slate-900">Discounts & Promotions</h1>
          <p className="text-sm text-slate-500">
            {(discounts as any[]).length} discount{(discounts as any[]).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Discount
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Value</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Code</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Uses</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Valid From</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Valid To</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Savings</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : (discounts as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                      No discounts yet
                    </td>
                  </tr>
                ) : (
                  (discounts as any[]).map((d) => {
                    const status = discountStatus(d)
                    return (
                      <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {TYPE_LABELS[d.type] ?? d.type}
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-mono">
                          {fmtValue(d.type, d.value)}
                        </td>
                        <td className="px-4 py-3">
                          {d.code ? (
                            <span className="inline-flex items-center gap-1 font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              <Tag className="h-3 w-3" /> {d.code}
                            </span>
                          ) : (
                            <span className="text-slate-400">Automatic</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {(d.usageCount ?? 0).toLocaleString()}
                          {d.maxUses ? ` / ${d.maxUses}` : ''}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_CLASSES[status]}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(d.startsAt)}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(d.endsAt)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          ${(d.totalSavings ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(d)}
                              title="Edit"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleActive(d)}
                              title={d.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {d.isActive ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-slate-400" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setDeleteTarget(d)}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Discount' : 'New Discount'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-name">Name</Label>
              <Input id="d-name" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select
                  defaultValue={editTarget?.type ?? 'percentage'}
                  onValueChange={(v) => setValue('type', v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                    <SelectItem value="bogo">Buy One Get One</SelectItem>
                    <SelectItem value="combo">Combo</SelectItem>
                    <SelectItem value="free_item">Free Item</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Scope</Label>
                <Select
                  defaultValue={editTarget?.scope ?? 'order'}
                  onValueChange={(v) => setValue('scope', v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order">Entire Order</SelectItem>
                    <SelectItem value="item">Specific Items</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(watchType === 'percentage' || watchType === 'fixed') && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-value">
                  Value {watchType === 'percentage' ? '(%)' : '($)'}
                </Label>
                <Input id="d-value" type="number" step="0.01" {...register('value')} />
                {errors.value && <p className="text-xs text-red-500">{errors.value.message}</p>}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-code">Promo Code (optional)</Label>
                <Input id="d-code" placeholder="SUMMER20" {...register('code')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-maxUses">Max Uses (0 = unlimited)</Label>
                <Input id="d-maxUses" type="number" {...register('maxUses')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-starts">Start Date</Label>
                <Input id="d-starts" type="date" {...register('startsAt')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-ends">End Date</Label>
                <Input id="d-ends" type="date" {...register('endsAt')} />
              </div>
            </div>

            {/* Days of week */}
            <div className="flex flex-col gap-2">
              <Label>Days of Week (leave blank = all days)</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      selectedDays.includes(day)
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-products">Applicable Product IDs (comma-separated)</Label>
              <Input
                id="d-products"
                placeholder="prod_1, prod_2"
                {...register('applicableProductIds')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-cats">Applicable Category IDs (comma-separated)</Label>
              <Input
                id="d-cats"
                placeholder="cat_1, cat_2"
                {...register('applicableCategoryIds')}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Discount'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Discount</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete{' '}
            <span className="font-medium">"{deleteTarget?.name}"</span>? This action cannot be
            undone.
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
    </div>
  )
}
