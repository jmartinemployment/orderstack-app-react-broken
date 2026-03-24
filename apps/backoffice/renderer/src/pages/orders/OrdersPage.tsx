import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
} from 'lucide-react'
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
  useOrders,
  useVoidOrder,
  type Order,
  type OrderStatus,
  type OrderType,
  type OrdersParams,
} from '../../hooks/use-orders'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtCurrency(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: BadgeVariant; className: string }
> = {
  pending: { label: 'Pending', variant: 'default', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  confirmed: { label: 'Confirmed', variant: 'default', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  in_progress: { label: 'In Progress', variant: 'warning', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  ready: { label: 'Ready', variant: 'success', className: 'bg-green-100 text-green-700 border-green-200' },
  completed: { label: 'Completed', variant: 'secondary', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  voided: { label: 'Voided', variant: 'destructive', className: 'bg-red-100 text-red-700 border-red-200' },
  refunded: { label: 'Refunded', variant: 'destructive', className: 'bg-red-100 text-red-700 border-red-200' },
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
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
  order,
  onClose,
}: {
  order: Order
  onClose: () => void
}) {
  const voidOrder = useVoidOrder()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VoidForm>({ resolver: zodResolver(voidSchema) })

  const onSubmit = (data: VoidForm) => {
    voidOrder.mutate({ id: order.id, reason: data.reason }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-red-500 mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Void Order {order.orderNumber}</h2>
            <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Reason for voiding</Label>
            <Input
              id="void-reason"
              placeholder="e.g. Customer cancelled"
              {...register('reason')}
            />
            {errors.reason && (
              <p className="text-xs text-red-500">{errors.reason.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={voidOrder.isPending}
            >
              {voidOrder.isPending ? 'Voiding…' : 'Void Order'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filters form
// ---------------------------------------------------------------------------

const ORDER_STATUSES: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'voided', label: 'Voided' },
  { value: 'refunded', label: 'Refunded' },
]

const ORDER_TYPES: { value: OrderType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'dine_in', label: 'Dine In' },
  { value: 'takeout', label: 'Takeout' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'online', label: 'Online' },
]

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function OrdersPage() {
  const navigate = useNavigate()

  const [filters, setFilters] = useState<OrdersParams>({
    status: undefined,
    orderType: undefined,
    locationId: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    page: 1,
    limit: PAGE_SIZE,
  })

  const [voidTarget, setVoidTarget] = useState<Order | null>(null)

  const { data, isLoading, isError } = useOrders(filters)

  const orders = data?.data ?? []
  const total = data?.total ?? 0
  const currentPage = filters.page ?? 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const setFilter = <K extends keyof OrdersParams>(key: K, value: OrdersParams[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined, page: 1 }))
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Status */}
            <div className="space-y-1">
              <Label htmlFor="status-filter" className="text-xs">Status</Label>
              <select
                id="status-filter"
                value={filters.status ?? ''}
                onChange={(e) => setFilter('status', (e.target.value as OrderStatus) || undefined)}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Order type */}
            <div className="space-y-1">
              <Label htmlFor="type-filter" className="text-xs">Order Type</Label>
              <select
                id="type-filter"
                value={filters.orderType ?? ''}
                onChange={(e) => setFilter('orderType', (e.target.value as OrderType) || undefined)}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ORDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date from */}
            <div className="space-y-1">
              <Label htmlFor="date-from" className="text-xs">From</Label>
              <Input
                id="date-from"
                type="date"
                className="w-36"
                value={filters.dateFrom ?? ''}
                onChange={(e) => setFilter('dateFrom', e.target.value || undefined)}
              />
            </div>

            {/* Date to */}
            <div className="space-y-1">
              <Label htmlFor="date-to" className="text-xs">To</Label>
              <Input
                id="date-to"
                type="date"
                className="w-36"
                value={filters.dateTo ?? ''}
                onChange={(e) => setFilter('dateTo', e.target.value || undefined)}
              />
            </div>

            {/* Location */}
            <div className="space-y-1">
              <Label htmlFor="location-filter" className="text-xs">Location</Label>
              <Input
                id="location-filter"
                placeholder="Location ID"
                className="w-40"
                value={filters.locationId ?? ''}
                onChange={(e) => setFilter('locationId', e.target.value || undefined)}
              />
            </div>

            {/* Clear */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({ page: 1, limit: PAGE_SIZE })
              }
              className="text-slate-500"
            >
              <X size={14} className="mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700">
              {isLoading ? 'Loading orders…' : `${total.toLocaleString()} order${total !== 1 ? 's' : ''}`}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Order #', 'Time', 'Customer', 'Type', 'Source', 'Items', 'Total', 'Status', 'Actions'].map(
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
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Loading…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-red-500 text-sm">
                      Failed to load orders.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && orders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No orders found.
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      #{order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {fmt(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {order.customerId ? (
                        <span className="text-sky-600">{order.customerId}</span>
                      ) : (
                        <span className="text-slate-400">Guest</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize whitespace-nowrap">
                      {order.orderType.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {order.locationId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {order.lineItems.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {fmtCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {order.status !== 'voided' && order.status !== 'refunded' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-7 px-2"
                          onClick={() => setVoidTarget(order)}
                        >
                          Void
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={currentPage <= 1}
                onClick={() => setFilters((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={currentPage >= totalPages}
                onClick={() => setFilters((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Void dialog */}
      {voidTarget && (
        <VoidOrderDialog order={voidTarget} onClose={() => setVoidTarget(null)} />
      )}
    </div>
  )
}
