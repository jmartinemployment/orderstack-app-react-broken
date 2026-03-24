import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, X, Trash2 } from 'lucide-react'
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
  usePurchaseOrders,
  useCreatePurchaseOrder,
  useVendors,
  type PurchaseOrderStatus,
  type PurchaseOrdersParams,
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
// Create PO dialog
// ---------------------------------------------------------------------------

const lineItemSchema = z.object({
  variantId: z.string().min(1, 'Required'),
  orderedQuantity: z.number({ invalid_type_error: 'Required' }).int().positive(),
  unitCost: z.number({ invalid_type_error: 'Required' }).positive(),
})

const createPOSchema = z.object({
  vendorId: z.string().min(1, 'Vendor is required'),
  locationId: z.string().min(1, 'Location is required'),
  expectedAt: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one item is required'),
})

type CreatePOForm = z.infer<typeof createPOSchema>

function CreatePODialog({ onClose }: { onClose: () => void }) {
  const createPO = useCreatePurchaseOrder()
  const { data: vendorsData } = useVendors()
  const vendors = vendorsData?.data ?? []

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePOForm>({
    resolver: zodResolver(createPOSchema),
    defaultValues: {
      lineItems: [{ variantId: '', orderedQuantity: 1, unitCost: 0 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' })

  const onSubmit = (data: CreatePOForm) => {
    createPO.mutate(
      {
        vendorId: data.vendorId,
        locationId: data.locationId,
        notes: data.notes,
        expectedAt: data.expectedAt,
        lineItems: data.lineItems.map((li) => ({
          variantId: li.variantId,
          orderedQuantity: li.orderedQuantity,
          unitCost: li.unitCost,
        })),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">New Purchase Order</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="create-po-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {/* Vendor */}
              <div className="space-y-1.5">
                <Label htmlFor="po-vendor">Vendor</Label>
                <select
                  id="po-vendor"
                  {...register('vendorId')}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                {errors.vendorId && (
                  <p className="text-xs text-red-500">{errors.vendorId.message}</p>
                )}
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <Label htmlFor="po-location">Location</Label>
                <Input
                  id="po-location"
                  placeholder="Location ID"
                  {...register('locationId')}
                />
                {errors.locationId && (
                  <p className="text-xs text-red-500">{errors.locationId.message}</p>
                )}
              </div>

              {/* Expected delivery */}
              <div className="space-y-1.5">
                <Label htmlFor="po-expected">Expected Delivery</Label>
                <Input id="po-expected" type="date" {...register('expectedAt')} />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="po-notes">Notes</Label>
                <Input id="po-notes" placeholder="Optional notes" {...register('notes')} />
              </div>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ variantId: '', orderedQuantity: 1, unitCost: 0 })}
                >
                  <Plus size={13} className="mr-1" />
                  Add Item
                </Button>
              </div>
              {errors.lineItems?.root && (
                <p className="text-xs text-red-500 mb-2">{errors.lineItems.root.message}</p>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_100px_120px_36px] gap-2 text-xs font-medium text-slate-500 uppercase tracking-wide px-1">
                  <span>SKU / Variant</span>
                  <span>Qty</span>
                  <span>Unit Cost ($)</span>
                  <span />
                </div>
                {fields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-[1fr_100px_120px_36px] gap-2 items-start">
                    <div>
                      <Input
                        placeholder="Variant ID or SKU"
                        {...register(`lineItems.${idx}.variantId`)}
                      />
                      {errors.lineItems?.[idx]?.variantId && (
                        <p className="text-xs text-red-500 mt-0.5">
                          {errors.lineItems[idx]?.variantId?.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        {...register(`lineItems.${idx}.orderedQuantity`, { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="0.00"
                        {...register(`lineItems.${idx}.unitCost`, { valueAsNumber: true })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-slate-400 hover:text-red-500"
                      onClick={() => remove(idx)}
                      disabled={fields.length === 1}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-po-form"
            disabled={createPO.isPending}
          >
            {createPO.isPending ? 'Creating…' : 'Create PO'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function PurchaseOrdersPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [params, setParams] = useState<PurchaseOrdersParams>({})

  const { data, isLoading, isError } = usePurchaseOrders(params)
  const orders = data?.data ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {isLoading ? 'Loading…' : `${total.toLocaleString()} purchase order${total !== 1 ? 's' : ''}`}
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={15} className="mr-1.5" />
          New PO
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="po-status-filter" className="text-xs">Status</Label>
              <select
                id="po-status-filter"
                value={params.status ?? ''}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    status: (e.target.value as PurchaseOrderStatus) || undefined,
                  }))
                }
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="partial">Partially Received</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="po-location-filter" className="text-xs">Location</Label>
              <Input
                id="po-location-filter"
                placeholder="Location ID"
                className="w-40"
                value={params.locationId ?? ''}
                onChange={(e) =>
                  setParams((p) => ({ ...p, locationId: e.target.value || undefined }))
                }
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500"
              onClick={() => setParams({})}
            >
              <X size={14} className="mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-0 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['PO #', 'Vendor', 'Location', 'Status', 'Items', 'Total', 'Expected', 'Actions'].map(
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
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Loading…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-red-500 text-sm">
                      Failed to load purchase orders.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && orders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No purchase orders found.
                    </td>
                  </tr>
                )}
                {orders.map((po) => (
                  <tr
                    key={po.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/inventory/purchase-orders/${po.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{po.poNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{po.vendorId}</td>
                    <td className="px-4 py-3 text-slate-600">{po.locationId}</td>
                    <td className="px-4 py-3">
                      <POStatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{po.lineItems.length}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {fmtCurrency(po.total)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {fmt(po.expectedAt)}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/inventory/purchase-orders/${po.id}`)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {createOpen && <CreatePODialog onClose={() => setCreateOpen(false)} />}
    </div>
  )
}
