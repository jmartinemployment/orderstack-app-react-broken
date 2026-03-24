import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  User,
  Clock,
  Calendar,
  FileText,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
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
import {
  useEmployee,
  useUpdateEmployee,
  useEmployeeTimeEntries,
  type Employee,
  type EmployeeRole,
  type TimeEntriesParams,
} from '../../hooks/use-employees'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLES: EmployeeRole[] = ['admin', 'manager', 'cashier', 'kitchen', 'driver']

function fmt(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function fmtHours(h: number) {
  return `${h.toFixed(2)} hrs`
}

// ---------------------------------------------------------------------------
// Edit personal info form
// ---------------------------------------------------------------------------

const personalSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
})
type PersonalForm = z.infer<typeof personalSchema>

function PersonalInfoSection({ employee }: { employee: Employee }) {
  const updateEmployee = useUpdateEmployee()
  const [editing, setEditing] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PersonalForm>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone ?? '',
    },
  })

  const onSubmit = (data: PersonalForm) => {
    updateEmployee.mutate(
      {
        id: employee.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || undefined,
      },
      {
        onSuccess: () => setEditing(false),
      },
    )
  }

  const handleCancel = () => {
    reset()
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={16} className="text-slate-400" />
            <CardTitle className="text-sm">Personal Info</CardTitle>
          </div>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-500"
              onClick={() => setEditing(true)}
            >
              <Pencil size={12} className="mr-1" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {editing ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-first">First Name</Label>
                <Input id="pf-first" {...register('firstName')} />
                {errors.firstName && (
                  <p className="text-xs text-red-500">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-last">Last Name</Label>
                <Input id="pf-last" {...register('lastName')} />
                {errors.lastName && (
                  <p className="text-xs text-red-500">{errors.lastName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-email">Email</Label>
                <Input id="pf-email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-phone">Phone</Label>
                <Input id="pf-phone" type="tel" {...register('phone')} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                <X size={13} className="mr-1" /> Cancel
              </Button>
              <Button type="submit" size="sm" disabled={updateEmployee.isPending}>
                <Check size={13} className="mr-1" />
                {updateEmployee.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'First Name', value: employee.firstName },
              { label: 'Last Name', value: employee.lastName },
              { label: 'Email', value: employee.email },
              { label: 'Phone', value: employee.phone ?? '—' },
              { label: 'Hire Date', value: fmtDate(employee.hireDate) },
              { label: 'Status', value: employee.isActive ? 'Active' : 'Inactive' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-slate-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pay & schedule section
// ---------------------------------------------------------------------------

function PaySection({ employee }: { employee: Employee }) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-slate-400" />
          <CardTitle className="text-sm">Pay & Schedule</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Role', value: employee.role.charAt(0).toUpperCase() + employee.role.slice(1) },
            { label: 'Pay Type', value: 'Hourly' },
            {
              label: 'Pay Rate',
              value: employee.hourlyRate !== undefined ? `$${employee.hourlyRate.toFixed(2)}/hr` : '—',
            },
            { label: 'Locations', value: employee.locationIds.join(', ') || '—' },
            { label: 'PIN Enabled', value: employee.pinEnabled ? 'Yes' : 'No' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className="text-slate-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Time entries tab
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

function TimeEntriesTab({ employeeId }: { employeeId: string }) {
  const [params, setParams] = useState<TimeEntriesParams>({ page: 1, limit: PAGE_SIZE })

  const { data, isLoading } = useEmployeeTimeEntries(employeeId, params)
  const entries = data?.data ?? []
  const total = data?.total ?? 0
  const currentPage = params.page ?? 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label htmlFor="te-from" className="text-xs">From</Label>
          <Input
            id="te-from"
            type="date"
            className="w-36"
            value={params.dateFrom ?? ''}
            onChange={(e) => setParams((p) => ({ ...p, dateFrom: e.target.value || undefined, page: 1 }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="te-to" className="text-xs">To</Label>
          <Input
            id="te-to"
            type="date"
            className="w-36"
            value={params.dateTo ?? ''}
            onChange={(e) => setParams((p) => ({ ...p, dateTo: e.target.value || undefined, page: 1 }))}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Clock In', 'Clock Out', 'Break', 'Reg Hours', 'OT Hours', 'Notes'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No time entries found.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap">{fmt(entry.clockedInAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmt(entry.clockedOutAt)}</td>
                <td className="px-4 py-3">{entry.breakMinutes} min</td>
                <td className="px-4 py-3">{fmtHours(entry.regularHours)}</td>
                <td className="px-4 py-3">
                  {entry.overtimeHours > 0 ? (
                    <span className="text-amber-600 font-medium">
                      {fmtHours(entry.overtimeHours)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 italic">{entry.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Page {currentPage} of {totalPages} &middot; {total} total
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={currentPage <= 1}
            onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
          >
            <ChevronLeft size={13} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={currentPage >= totalPages}
            onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
          >
            <ChevronRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'time_entries' | 'shifts' | 'time_off'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'time_entries', label: 'Time Entries', icon: <Clock size={14} /> },
  { id: 'shifts', label: 'Upcoming Shifts', icon: <Calendar size={14} /> },
  { id: 'time_off', label: 'Time Off', icon: <FileText size={14} /> },
]

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('time_entries')

  const { data: employee, isLoading, isError } = useEmployee(id ?? '')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading employee…
      </div>
    )
  }

  if (isError || !employee) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-red-500 text-sm">Failed to load employee.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} className="mr-1" /> Back
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">
            {employee.role} &middot;{' '}
            {employee.isActive ? (
              <span className="text-green-600 font-medium">Active</span>
            ) : (
              <span className="text-red-500 font-medium">Inactive</span>
            )}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PersonalInfoSection employee={employee} />
        <PaySection employee={employee} />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-sky-500 text-sky-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="pt-5">
          {activeTab === 'time_entries' && <TimeEntriesTab employeeId={employee.id} />}

          {activeTab === 'shifts' && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500 text-center py-6">
                  Upcoming shifts for this employee are managed in the{' '}
                  <button
                    type="button"
                    className="text-sky-600 underline"
                    onClick={() => navigate('/employees/schedules')}
                  >
                    Schedules
                  </button>{' '}
                  page.
                </p>
              </CardContent>
            </Card>
          )}

          {activeTab === 'time_off' && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500 text-center py-6">
                  No time off requests.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
