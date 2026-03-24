import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, KeyRound, X, AlertTriangle, UserX } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
} from '@orderstack/ui'
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useSetEmployeePin,
  type Employee,
  type EmployeeRole,
  type CreateEmployeeBody,
  type UpdateEmployeeBody,
} from '../../hooks/use-employees'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLES: EmployeeRole[] = ['admin', 'manager', 'cashier', 'kitchen', 'driver']

function roleLabel(role: EmployeeRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

// ---------------------------------------------------------------------------
// Employee form schema
// ---------------------------------------------------------------------------

const employeeSchema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  role: z.enum(['admin', 'manager', 'cashier', 'kitchen', 'driver']),
  payType: z.enum(['hourly', 'salary']),
  payRate: z.number({ invalid_type_error: 'Required' }).positive(),
  locationIds: z.string().min(1, 'At least one location required'),
  hireDate: z.string().optional(),
})

type EmployeeForm = z.infer<typeof employeeSchema>

// ---------------------------------------------------------------------------
// Employee modal (create / edit)
// ---------------------------------------------------------------------------

function EmployeeModal({
  employee,
  onClose,
}: {
  employee?: Employee
  onClose: () => void
}) {
  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()
  const isEditing = Boolean(employee)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      email: employee?.email ?? '',
      phone: employee?.phone ?? '',
      role: employee?.role ?? 'cashier',
      payType: 'hourly',
      payRate: employee?.hourlyRate ?? 0,
      locationIds: employee?.locationIds?.join(', ') ?? '',
      hireDate: employee?.hireDate ?? '',
    },
  })

  const onSubmit = (data: EmployeeForm) => {
    const locationIds = data.locationIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const body: CreateEmployeeBody = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || undefined,
      role: data.role,
      locationIds,
      hourlyRate: data.payRate,
      hireDate: data.hireDate || undefined,
    }

    if (isEditing && employee) {
      const updateBody: UpdateEmployeeBody = { id: employee.id, ...body }
      updateEmployee.mutate(updateBody, { onSuccess: onClose })
    } else {
      createEmployee.mutate(body, { onSuccess: onClose })
    }
  }

  const isPending = createEmployee.isPending || updateEmployee.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isEditing ? 'Edit Employee' : 'New Employee'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="employee-form" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="e-first">First Name</Label>
                <Input id="e-first" placeholder="Jane" {...register('firstName')} />
                {errors.firstName && (
                  <p className="text-xs text-red-500">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-last">Last Name</Label>
                <Input id="e-last" placeholder="Doe" {...register('lastName')} />
                {errors.lastName && (
                  <p className="text-xs text-red-500">{errors.lastName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-email">Email</Label>
                <Input id="e-email" type="email" placeholder="jane@example.com" {...register('email')} />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-phone">Phone</Label>
                <Input id="e-phone" type="tel" placeholder="+1 555 000 0000" {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-role">Role</Label>
                <select
                  id="e-role"
                  {...register('role')}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-hire">Hire Date</Label>
                <Input id="e-hire" type="date" {...register('hireDate')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-pay-type">Pay Type</Label>
                <select
                  id="e-pay-type"
                  {...register('payType')}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-rate">Pay Rate ($/hr or $/yr)</Label>
                <Input
                  id="e-rate"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="18.00"
                  {...register('payRate', { valueAsNumber: true })}
                />
                {errors.payRate && (
                  <p className="text-xs text-red-500">{errors.payRate.message}</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="e-locations">
                  Locations{' '}
                  <span className="text-slate-400 font-normal">(comma-separated IDs)</span>
                </Label>
                <Input
                  id="e-locations"
                  placeholder="loc_1, loc_2"
                  {...register('locationIds')}
                />
                {errors.locationIds && (
                  <p className="text-xs text-red-500">{errors.locationIds.message}</p>
                )}
              </div>
            </div>
          </form>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" disabled={isPending}>
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Employee'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Set PIN dialog
// ---------------------------------------------------------------------------

const pinSchema = z.object({
  pin: z
    .string()
    .min(4, 'PIN must be 4–6 digits')
    .max(6, 'PIN must be 4–6 digits')
    .regex(/^\d+$/, 'PIN must be digits only'),
  confirm: z.string(),
}).refine((d) => d.pin === d.confirm, { message: 'PINs do not match', path: ['confirm'] })

type PinForm = z.infer<typeof pinSchema>

function SetPinDialog({
  employee,
  onClose,
}: {
  employee: Employee
  onClose: () => void
}) {
  const setPin = useSetEmployeePin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PinForm>({ resolver: zodResolver(pinSchema) })

  const onSubmit = (data: PinForm) => {
    setPin.mutate({ id: employee.id, pin: data.pin }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Set PIN</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {employee.firstName} {employee.lastName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pin-new">New PIN (4–6 digits)</Label>
            <Input
              id="pin-new"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              {...register('pin')}
            />
            {errors.pin && (
              <p className="text-xs text-red-500">{errors.pin.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pin-confirm">Confirm PIN</Label>
            <Input
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••"
              {...register('confirm')}
            />
            {errors.confirm && (
              <p className="text-xs text-red-500">{errors.confirm.message}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={setPin.isPending}>
              {setPin.isPending ? 'Saving…' : 'Set PIN'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deactivate confirm dialog
// ---------------------------------------------------------------------------

function DeactivateDialog({
  employee,
  onClose,
}: {
  employee: Employee
  onClose: () => void
}) {
  const updateEmployee = useUpdateEmployee()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-yellow-500 mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Deactivate Employee</h2>
            <p className="text-sm text-slate-500 mt-1">
              Deactivate{' '}
              <span className="font-medium text-slate-900">
                {employee.firstName} {employee.lastName}
              </span>
              ? They will lose access to the system.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={updateEmployee.isPending}
            onClick={() =>
              updateEmployee.mutate(
                { id: employee.id, isActive: false },
                { onSuccess: onClose },
              )
            }
          >
            {updateEmployee.isPending ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function EmployeesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | ''>('')
  const [editTarget, setEditTarget] = useState<Employee | null | 'new'>(null)
  const [pinTarget, setPinTarget] = useState<Employee | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)

  const { data, isLoading, isError } = useEmployees({
    search: search || undefined,
    role: roleFilter || undefined,
  })

  const employees = data?.data ?? []

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 justify-between flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Search employees…"
            className="w-60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as EmployeeRole | '')}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => setEditTarget('new')}>
          <Plus size={15} className="mr-1.5" />
          New Employee
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-0 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Name', 'Role', 'Pay Type', 'Pay Rate', 'Locations', 'Status', 'Actions'].map(
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
                      Loading employees…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-red-500 text-sm">
                      Failed to load employees.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && employees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No employees found.
                    </td>
                  </tr>
                )}
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/employees/${emp.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-xs text-slate-500">{emp.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="capitalize text-slate-700">{emp.role}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">Hourly</td>
                    <td className="px-4 py-3 text-slate-700">
                      {emp.hourlyRate !== undefined
                        ? `$${emp.hourlyRate.toFixed(2)}/hr`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {emp.locationIds.length > 0
                        ? emp.locationIds.join(', ')
                        : <span className="text-slate-400">None</span>}
                    </td>
                    <td className="px-4 py-3">
                      {emp.isActive ? (
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 border-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 border-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={() => setEditTarget(emp)}
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={() => setPinTarget(emp)}
                          title="Set PIN"
                        >
                          <KeyRound size={13} />
                        </Button>
                        {emp.isActive && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-red-500"
                            onClick={() => setDeactivateTarget(emp)}
                            title="Deactivate"
                          >
                            <UserX size={13} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {(editTarget === 'new' || (editTarget && editTarget !== 'new')) && (
        <EmployeeModal
          employee={editTarget !== 'new' ? editTarget : undefined}
          onClose={() => setEditTarget(null)}
        />
      )}
      {pinTarget && (
        <SetPinDialog employee={pinTarget} onClose={() => setPinTarget(null)} />
      )}
      {deactivateTarget && (
        <DeactivateDialog
          employee={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  )
}
