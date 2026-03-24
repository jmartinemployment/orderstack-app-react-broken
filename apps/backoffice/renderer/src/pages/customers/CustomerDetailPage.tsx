import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Edit2, ShoppingBag, Star, StickyNote } from 'lucide-react'
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
import {
  useCustomer,
  useCustomerOrders,
  useCustomerLoyalty,
  useUpdateCustomer,
} from '../../../hooks/use-customers'

// ─── Schema ───────────────────────────────────────────────────────────────────

const editSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
  notes: z.string().optional(),
})

type EditFormValues = z.infer<typeof editSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

const TAG_COLORS: Record<string, string> = {
  vip: 'bg-amber-100 text-amber-700',
  loyal: 'bg-green-100 text-green-700',
  new: 'bg-blue-100 text-blue-700',
  default: 'bg-slate-100 text-slate-700',
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'orders' | 'loyalty'>('orders')
  const [ordersPage, setOrdersPage] = useState(1)
  const [editOpen, setEditOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)

  const { data: customer, isLoading: loadingCustomer } = useCustomer(id ?? '')
  const { data: ordersData, isLoading: loadingOrders } = useCustomerOrders(id ?? '', {
    page: ordersPage,
    limit: 10,
  })
  const { data: loyaltyData, isLoading: loadingLoyalty } = useCustomerLoyalty(id ?? '')
  const updateMutation = useUpdateCustomer()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({ resolver: zodResolver(editSchema) })

  const openEdit = () => {
    if (!customer) return
    reset({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      birthday: customer.birthday ?? '',
      marketingOptIn: customer.marketingOptIn ?? false,
      notes: customer.notes ?? '',
    })
    setNotes(customer.notes ?? '')
    setEditOpen(true)
  }

  const onEditSubmit = async (values: EditFormValues) => {
    await updateMutation.mutateAsync({ id: id!, ...values })
    setEditOpen(false)
  }

  const saveNotes = async () => {
    await updateMutation.mutateAsync({ id: id!, notes })
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loadingCustomer) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>
    )
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-slate-500">Customer not found.</p>
        <Button variant="outline" onClick={() => navigate('/customers')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    )
  }

  const orders = ordersData?.data ?? []
  const orderTotal = ordersData?.total ?? 0
  const totalOrderPages = Math.ceil(orderTotal / 10)
  const loyaltyPrograms = loyaltyData ?? []

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/customers')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 w-fit"
      >
        <ArrowLeft className="h-4 w-4" /> All Customers
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {customer.firstName} {customer.lastName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            {customer.email && <span>{customer.email}</span>}
            {customer.phone && <span>{customer.phone}</span>}
            {customer.birthday && <span>DOB: {fmtDate(customer.birthday)}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {(customer.tags ?? []).map((tag: string) => (
              <span
                key={tag}
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TAG_COLORS[tag] ?? TAG_COLORS.default}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <Button variant="outline" onClick={openEdit}>
          <Edit2 className="mr-2 h-4 w-4" /> Edit
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Visits" value={String(customer.totalVisits ?? 0)} />
        <KpiCard label="Lifetime Spend" value={fmt(customer.lifetimeSpend ?? 0)} />
        <KpiCard
          label="Avg Order Value"
          value={
            (customer.totalVisits ?? 0) > 0
              ? fmt((customer.lifetimeSpend ?? 0) / (customer.totalVisits ?? 1))
              : '—'
          }
        />
        <KpiCard label="Last Visit" value={fmtDate(customer.lastVisitAt)} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'orders'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setTab('orders')}
        >
          <ShoppingBag className="h-4 w-4" /> Order History
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'loyalty'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          onClick={() => setTab('loyalty')}
        >
          <Star className="h-4 w-4" /> Loyalty
        </button>
      </div>

      {/* Orders Tab */}
      {tab === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order History ({orderTotal})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Order #</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOrders ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                        No orders yet
                      </td>
                    </tr>
                  ) : (
                    orders.map((o: any) => (
                      <tr
                        key={o.id}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                        onClick={() => navigate(`/orders/${o.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-slate-700">{o.orderNumber}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(o.createdAt)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="capitalize">
                            {o.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {fmt(o.total)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalOrderPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                <p className="text-sm text-slate-500">
                  Page {ordersPage} of {totalOrderPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ordersPage <= 1}
                    onClick={() => setOrdersPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ordersPage >= totalOrderPages}
                    onClick={() => setOrdersPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loyalty Tab */}
      {tab === 'loyalty' && (
        <div className="flex flex-col gap-4">
          {loadingLoyalty ? (
            <div className="text-slate-400 py-8 text-center">Loading…</div>
          ) : loyaltyPrograms.length === 0 ? (
            <div className="text-slate-400 py-8 text-center">
              Not enrolled in any loyalty programs
            </div>
          ) : (
            loyaltyPrograms.map((lp: any) => (
              <Card key={lp.programId}>
                <CardHeader>
                  <CardTitle className="text-base">{lp.programName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Balance</p>
                      <p className="text-lg font-semibold">{lp.balance ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Tier</p>
                      <p className="text-lg font-semibold capitalize">{lp.tier ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Points</p>
                      <p className="text-lg font-semibold">{lp.points ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-0.5">Last Activity</p>
                      <p className="text-lg font-semibold">{fmtDate(lp.lastActivityAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            className="w-full min-h-[100px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 resize-y"
            placeholder="Add private notes about this customer…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={saveNotes} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save Notes'}
            </Button>
            {notesSaved && <span className="text-sm text-green-600">Saved!</span>}
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onEditSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-firstName">First Name</Label>
                <Input id="edit-firstName" {...register('firstName')} />
                {errors.firstName && (
                  <p className="text-xs text-red-500">{errors.firstName.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input id="edit-lastName" {...register('lastName')} />
                {errors.lastName && (
                  <p className="text-xs text-red-500">{errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" {...register('email')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" type="tel" {...register('phone')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-birthday">Birthday</Label>
              <Input id="edit-birthday" type="date" {...register('birthday')} />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="edit-marketingOptIn"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                {...register('marketingOptIn')}
              />
              <Label htmlFor="edit-marketingOptIn" className="cursor-pointer">
                Marketing opt-in
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
