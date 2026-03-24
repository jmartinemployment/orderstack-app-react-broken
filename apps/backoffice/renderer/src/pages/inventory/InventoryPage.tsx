import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { SlidersHorizontal, X, AlertTriangle, TrendingDown } from 'lucide-react'
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
  useInventory,
  useCreateAdjustment,
  type InventoryLevel,
  type CreateAdjustmentBody,
} from '../../hooks/use-inventory'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeStatus(level: InventoryLevel): 'in_stock' | 'low_stock' | 'out_of_stock' {
  if (level.quantityAvailable <= 0) return 'out_of_stock'
  if (level.reorderPoint !== undefined && level.quantityAvailable <= level.reorderPoint) {
    return 'low_stock'
  }
  return 'in_stock'
}

// ---------------------------------------------------------------------------
// Adjustment modal
// ---------------------------------------------------------------------------

const adjustmentTypes = ['waste', 'purchase_order', 'manual'] as const
type AdjType = (typeof adjustmentTypes)[number]

const adjSchema = z.object({
  adjustmentType: z.enum(adjustmentTypes),
  quantity: z.number({ invalid_type_error: 'Required' }).int().refine((n) => n !== 0, {
    message: 'Quantity cannot be zero',
  }),
  reason: z.string().optional(),
})
type AdjForm = z.infer<typeof adjSchema>

function AdjustModal({
  level,
  onClose,
}: {
  level: InventoryLevel
  onClose: () => void
}) {
  const createAdj = useCreateAdjustment()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdjForm>({
    resolver: zodResolver(adjSchema),
    defaultValues: { adjustmentType: 'manual', quantity: 0 },
  })

  const onSubmit = (data: AdjForm) => {
    const body: CreateAdjustmentBody = {
      variantId: level.variantId,
      locationId: level.locationId,
      adjustmentType: data.adjustmentType,
      quantity: data.quantity,
      reason: data.reason,
    }
    createAdj.mutate(body, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Adjust Inventory — {level.variantId}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm grid grid-cols-3 gap-3">
          {[
            { label: 'On Hand', value: level.quantityOnHand },
            { label: 'Reserved', value: level.quantityReserved },
            { label: 'Available', value: level.quantityAvailable },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-slate-500 text-xs">{label}</p>
              <p className="font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adj-type">Type</Label>
            <select
              id="adj-type"
              {...register('adjustmentType')}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="manual">Manual</option>
              <option value="waste">Waste / Spoilage</option>
              <option value="purchase_order">Purchase Order Receive</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-qty">
              Quantity <span className="text-slate-400 font-normal">(negative to remove)</span>
            </Label>
            <Input
              id="adj-qty"
              type="number"
              placeholder="e.g. 10 or -5"
              {...register('quantity', { valueAsNumber: true })}
            />
            {errors.quantity && (
              <p className="text-xs text-red-500">{errors.quantity.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Notes (optional)</Label>
            <Input
              id="adj-reason"
              placeholder="Add a note…"
              {...register('reason')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAdj.isPending}>
              {createAdj.isPending ? 'Saving…' : 'Save Adjustment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Count sheet (full-page overlay)
// ---------------------------------------------------------------------------

function CountSheet({
  levels,
  onClose,
}: {
  levels: InventoryLevel[]
  onClose: () => void
}) {
  const createAdj = useCreateAdjustment()
  const [counts, setCounts] = useState<Record<string, string>>({})

  const handleSave = () => {
    const mutations = levels
      .filter((l) => counts[l.variantId] !== undefined && counts[l.variantId] !== '')
      .map((l) => {
        const counted = parseInt(counts[l.variantId] ?? '0', 10)
        const diff = counted - l.quantityOnHand
        return createAdj.mutateAsync({
          variantId: l.variantId,
          locationId: l.locationId,
          adjustmentType: 'manual',
          quantity: diff,
          reason: 'Physical count',
        })
      })
    Promise.all(mutations).then(onClose).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-900">Inventory Count Sheet</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={createAdj.isPending}>
            {createAdj.isPending ? 'Saving…' : 'Save Count'}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
            <tr>
              {['SKU / Variant', 'Expected (On Hand)', 'Counted Qty', 'Variance'].map((h) => (
                <th
                  key={h}
                  className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {levels.map((level) => {
              const counted = parseInt(counts[level.variantId] ?? '', 10)
              const variance = isNaN(counted) ? null : counted - level.quantityOnHand
              return (
                <tr key={level.variantId} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{level.variantId}</td>
                  <td className="px-6 py-3 text-slate-600">{level.quantityOnHand}</td>
                  <td className="px-6 py-3">
                    <Input
                      type="number"
                      className="w-28"
                      placeholder="—"
                      value={counts[level.variantId] ?? ''}
                      onChange={(e) =>
                        setCounts((prev) => ({ ...prev, [level.variantId]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-6 py-3">
                    {variance !== null && (
                      <span
                        className={`font-medium ${
                          variance > 0
                            ? 'text-green-600'
                            : variance < 0
                              ? 'text-red-600'
                              : 'text-slate-500'
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function InventoryPage() {
  const [locationId, setLocationId] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<InventoryLevel | null>(null)
  const [countOpen, setCountOpen] = useState(false)

  const { data: levels = [], isLoading, isError } = useInventory(locationId)

  const filtered = lowStockOnly
    ? levels.filter((l) => {
        const s = computeStatus(l)
        return s === 'low_stock' || s === 'out_of_stock'
      })
    : levels

  const statusCounts = {
    in_stock: levels.filter((l) => computeStatus(l) === 'in_stock').length,
    low_stock: levels.filter((l) => computeStatus(l) === 'low_stock').length,
    out_of_stock: levels.filter((l) => computeStatus(l) === 'out_of_stock').length,
  }

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="location-sel" className="text-xs">Location</Label>
            <Input
              id="location-sel"
              placeholder="Enter location ID"
              className="w-48"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer pb-1.5">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
            />
            <TrendingDown size={14} className="text-yellow-500" />
            Low stock only
          </label>
        </div>
        <Button
          onClick={() => setCountOpen(true)}
          disabled={levels.length === 0}
          variant="outline"
        >
          <SlidersHorizontal size={15} className="mr-1.5" />
          Start Count
        </Button>
      </div>

      {/* Summary cards */}
      {levels.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">In Stock</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{statusCounts.in_stock}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Low Stock</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{statusCounts.low_stock}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Out of Stock</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{statusCounts.out_of_stock}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {isLoading
              ? 'Loading…'
              : locationId
                ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`
                : 'Select a location to view inventory'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['SKU / Variant', 'On Hand', 'Reserved', 'Available', 'Reorder Point', 'Status', 'Actions'].map(
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
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Loading inventory…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-red-500 text-sm">
                      Failed to load inventory.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                      {locationId ? 'No items found.' : 'Select a location above.'}
                    </td>
                  </tr>
                )}
                {filtered.map((level) => {
                  const status = computeStatus(level)
                  const rowClass =
                    status === 'out_of_stock'
                      ? 'bg-red-50'
                      : status === 'low_stock'
                        ? 'bg-yellow-50'
                        : ''
                  return (
                    <tr key={`${level.variantId}-${level.locationId}`} className={`${rowClass} hover:brightness-95 transition-all`}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {level.variantId}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{level.quantityOnHand}</td>
                      <td className="px-4 py-3 text-slate-600">{level.quantityReserved}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {level.quantityAvailable}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {level.reorderPoint ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {status === 'in_stock' && (
                          <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 border-green-200">
                            In Stock
                          </span>
                        )}
                        {status === 'low_stock' && (
                          <span className="inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-700 border-yellow-200">
                            <AlertTriangle size={10} />
                            Low Stock
                          </span>
                        )}
                        {status === 'out_of_stock' && (
                          <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border-red-200">
                            Out of Stock
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setAdjustTarget(level)}
                        >
                          Adjust
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Adjust modal */}
      {adjustTarget && (
        <AdjustModal level={adjustTarget} onClose={() => setAdjustTarget(null)} />
      )}

      {/* Count sheet */}
      {countOpen && (
        <CountSheet levels={filtered.length > 0 ? filtered : levels} onClose={() => setCountOpen(false)} />
      )}
    </div>
  )
}
