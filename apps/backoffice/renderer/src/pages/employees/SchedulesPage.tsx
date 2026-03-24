import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Pencil,
  Trash2,
  Send,
  DollarSign,
  AlertTriangle,
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
  useSchedules,
  useScheduleShifts,
  useCreateSchedule,
  usePublishSchedule,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
  useEmployees,
  type Shift,
  type EmployeeRole,
  type CreateShiftBody,
  type UpdateShiftBody,
} from '../../hooks/use-employees'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
type DayLabel = (typeof DAYS)[number]

const ROLE_COLORS: Record<EmployeeRole, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  manager: 'bg-sky-100 text-sky-700 border-sky-200',
  cashier: 'bg-green-100 text-green-700 border-green-200',
  kitchen: 'bg-orange-100 text-orange-700 border-orange-200',
  driver: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

/** Return Monday of the ISO week containing `date` */
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** ISO date string yyyy-MM-dd */
function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] as string
}

/** Returns array of 7 Date objects starting from weekStart */
function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

function fmtRange(start: string, end: string) {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ampm = (h ?? 0) >= 12 ? 'pm' : 'am'
    const hour = (h ?? 0) % 12 || 12
    return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
  }
  return `${fmt(start)}–${fmt(end)}`
}

function shiftHours(start: string, end: string): number {
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }
  return Math.max(0, (toMins(end) - toMins(start)) / 60)
}

// ---------------------------------------------------------------------------
// Shift modal (create / edit)
// ---------------------------------------------------------------------------

const shiftSchema = z.object({
  employeeId: z.string().min(1, 'Employee required'),
  role: z.enum(['admin', 'manager', 'cashier', 'kitchen', 'driver']),
  startTime: z.string().min(1, 'Required'),
  endTime: z.string().min(1, 'Required'),
  notes: z.string().optional(),
})
type ShiftForm = z.infer<typeof shiftSchema>

function ShiftModal({
  scheduleId,
  locationId,
  prefillDate,
  existingShift,
  onClose,
}: {
  scheduleId: string
  locationId: string
  prefillDate?: string
  existingShift?: Shift
  onClose: () => void
}) {
  const { data: empData } = useEmployees({ locationId })
  const employees = empData?.data ?? []
  const createShift = useCreateShift(scheduleId)
  const updateShift = useUpdateShift()
  const isEditing = Boolean(existingShift)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ShiftForm>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      employeeId: existingShift?.employeeId ?? '',
      role: existingShift?.role ?? 'cashier',
      startTime: existingShift?.startTime ?? '09:00',
      endTime: existingShift?.endTime ?? '17:00',
      notes: existingShift?.notes ?? '',
    },
  })

  const onSubmit = (data: ShiftForm) => {
    if (isEditing && existingShift) {
      const body: UpdateShiftBody = {
        id: existingShift.id,
        employeeId: data.employeeId,
        role: data.role,
        startTime: data.startTime,
        endTime: data.endTime,
        notes: data.notes,
      }
      updateShift.mutate(body, { onSuccess: onClose })
    } else {
      const body: CreateShiftBody = {
        employeeId: data.employeeId,
        locationId,
        date: prefillDate ?? toISODate(new Date()),
        startTime: data.startTime,
        endTime: data.endTime,
        role: data.role,
        notes: data.notes,
      }
      createShift.mutate(body, { onSuccess: onClose })
    }
  }

  const isPending = createShift.isPending || updateShift.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {isEditing ? 'Edit Shift' : 'Add Shift'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sh-emp">Employee</Label>
            <select
              id="sh-emp"
              {...register('employeeId')}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
            {errors.employeeId && (
              <p className="text-xs text-red-500">{errors.employeeId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sh-role">Role</Label>
            <select
              id="sh-role"
              {...register('role')}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="cashier">Cashier</option>
              <option value="kitchen">Kitchen</option>
              <option value="driver">Driver</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sh-start">Start Time</Label>
              <Input id="sh-start" type="time" {...register('startTime')} />
              {errors.startTime && (
                <p className="text-xs text-red-500">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-end">End Time</Label>
              <Input id="sh-end" type="time" {...register('endTime')} />
              {errors.endTime && (
                <p className="text-xs text-red-500">{errors.endTime.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sh-notes">Notes (optional)</Label>
            <Input id="sh-notes" placeholder="Any notes…" {...register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Shift'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Publish confirm dialog
// ---------------------------------------------------------------------------

function PublishDialog({
  scheduleId,
  laborCost,
  onClose,
}: {
  scheduleId: string
  laborCost: number
  onClose: () => void
}) {
  const publishSchedule = usePublishSchedule()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Send size={18} className="text-sky-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Publish Schedule</h2>
            <p className="text-sm text-slate-500 mt-1">
              Projected labor cost:{' '}
              <span className="font-semibold text-slate-900">
                ${laborCost.toFixed(2)}
              </span>
              . Employees will be notified.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={publishSchedule.isPending}
            onClick={() =>
              publishSchedule.mutate({ id: scheduleId }, { onSuccess: onClose })
            }
          >
            {publishSchedule.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete shift confirm
// ---------------------------------------------------------------------------

function DeleteShiftDialog({
  shift,
  onClose,
}: {
  shift: Shift
  onClose: () => void
}) {
  const deleteShift = useDeleteShift()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold">Delete Shift</h2>
            <p className="text-sm text-slate-500 mt-1">
              Remove the {fmtRange(shift.startTime, shift.endTime)} shift?
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={deleteShift.isPending}
            onClick={() =>
              deleteShift.mutate(
                { id: shift.id, scheduleId: shift.scheduleId },
                { onSuccess: onClose },
              )
            }
          >
            {deleteShift.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SchedulesPage() {
  const [locationId, setLocationId] = useState('')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [addCell, setAddCell] = useState<{ date: string } | null>(null)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [deleteShift, setDeleteShiftTarget] = useState<Shift | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const weekOf = toISODate(weekStart)

  // Fetch or find schedule for this week + location
  const { data: schedulesData } = useSchedules(
    { locationId: locationId || '_', weekOf },
  )
  const schedule = schedulesData?.data?.[0]

  // Fetch shifts for that schedule
  const { data: shifts = [] } = useScheduleShifts(schedule?.id ?? '')

  const createSchedule = useCreateSchedule()

  // Fetch employees for the location
  const { data: empData } = useEmployees(locationId ? { locationId } : undefined)
  const employees = empData?.data ?? []

  // Group shifts by employeeId + date
  const shiftGrid = useMemo(() => {
    const map: Record<string, Record<string, Shift[]>> = {}
    for (const shift of shifts) {
      if (!map[shift.employeeId]) map[shift.employeeId] = {}
      const dateShifts = map[shift.employeeId]![shift.date]
      if (dateShifts) {
        dateShifts.push(shift)
      } else {
        map[shift.employeeId]![shift.date] = [shift]
      }
    }
    return map
  }, [shifts])

  // Projected labor cost
  const laborCost = useMemo(() => {
    return shifts.reduce((total, shift) => {
      const emp = employees.find((e) => e.id === shift.employeeId)
      const rate = emp?.hourlyRate ?? 0
      return total + shiftHours(shift.startTime, shift.endTime) * rate
    }, 0)
  }, [shifts, employees])

  const handlePrevWeek = () => {
    setWeekStart((d) => {
      const n = new Date(d)
      n.setDate(n.getDate() - 7)
      return n
    })
  }

  const handleNextWeek = () => {
    setWeekStart((d) => {
      const n = new Date(d)
      n.setDate(n.getDate() + 7)
      return n
    })
  }

  const ensureScheduleAndAdd = (date: string) => {
    if (!schedule) {
      createSchedule.mutate(
        { locationId, weekOf },
        {
          onSuccess: () => setAddCell({ date }),
        },
      )
    } else {
      setAddCell({ date })
    }
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="sched-loc" className="text-xs">Location</Label>
            <Input
              id="sched-loc"
              placeholder="Location ID"
              className="w-44"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrevWeek}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-medium text-slate-700 px-2 whitespace-nowrap">
              {weekDates[0]?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
              {weekDates[6]?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleNextWeek}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Labor cost preview */}
          <div className="flex items-center gap-1.5 text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
            <DollarSign size={14} className="text-green-600" />
            <span>Projected Labor:</span>
            <span className="font-semibold text-slate-900">${laborCost.toFixed(2)}</span>
          </div>
          {schedule && !schedule.publishedAt && (
            <Button onClick={() => setPublishOpen(true)} disabled={shifts.length === 0}>
              <Send size={14} className="mr-1.5" />
              Publish
            </Button>
          )}
          {schedule?.publishedAt && (
            <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              Published
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="pt-0 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-44 whitespace-nowrap">
                    Employee
                  </th>
                  {weekDates.map((date, idx) => (
                    <th
                      key={date.toISOString()}
                      className="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[120px]"
                    >
                      <span className="block">{DAYS[idx]}</span>
                      <span className="block font-normal text-slate-400 normal-case text-xs mt-0.5">
                        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {!locationId && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Select a location to view the schedule.
                    </td>
                  </tr>
                )}
                {locationId && employees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No employees at this location.
                    </td>
                  </tr>
                )}
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-slate-900 text-sm">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-xs text-slate-500 capitalize">{emp.role}</p>
                    </td>
                    {weekDates.map((date) => {
                      const dateStr = toISODate(date)
                      const dayShifts = shiftGrid[emp.id]?.[dateStr] ?? []
                      return (
                        <td
                          key={dateStr}
                          className="px-2 py-2 align-top min-w-[120px] cursor-pointer group"
                          onClick={() => ensureScheduleAndAdd(dateStr)}
                        >
                          <div className="space-y-1 min-h-[40px]">
                            {dayShifts.map((shift) => (
                              <div
                                key={shift.id}
                                className={`rounded border px-1.5 py-1 text-xs cursor-pointer ${
                                  ROLE_COLORS[shift.role] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditShift(shift)
                                }}
                              >
                                <p className="font-medium">{fmtRange(shift.startTime, shift.endTime)}</p>
                                <p className="capitalize opacity-75">{shift.role}</p>
                                <div className="flex gap-1 mt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setEditShift(shift) }}
                                    className="opacity-60 hover:opacity-100"
                                  >
                                    <Pencil size={10} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setDeleteShiftTarget(shift) }}
                                    className="opacity-60 hover:opacity-100 hover:text-red-600"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); ensureScheduleAndAdd(dateStr) }}
                                className="flex items-center gap-0.5 text-xs text-slate-400 hover:text-sky-600"
                              >
                                <Plus size={11} />
                                Add
                              </button>
                            </div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {addCell && schedule && (
        <ShiftModal
          scheduleId={schedule.id}
          locationId={locationId}
          prefillDate={addCell.date}
          onClose={() => setAddCell(null)}
        />
      )}
      {editShift && schedule && (
        <ShiftModal
          scheduleId={schedule.id}
          locationId={locationId}
          existingShift={editShift}
          onClose={() => setEditShift(null)}
        />
      )}
      {deleteShift && (
        <DeleteShiftDialog shift={deleteShift} onClose={() => setDeleteShiftTarget(null)} />
      )}
      {publishOpen && schedule && (
        <PublishDialog
          scheduleId={schedule.id}
          laborCost={laborCost}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  )
}
