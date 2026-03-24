import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  X,
  Pencil,
  Download,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
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
import { api } from '../../lib/api'
import type { TimeEntry } from '../../hooks/use-employees'

// ---------------------------------------------------------------------------
// Types (augmented for timesheets view)
// ---------------------------------------------------------------------------

export type TimeEntryStatus = 'pending' | 'approved' | 'rejected'

export interface TimesheetEntry extends TimeEntry {
  status: TimeEntryStatus
  grossPay: number
  employeeName?: string
  hourlyRate?: number
}

interface TimesheetResponse {
  data: TimesheetEntry[]
  total: number
  page: number
  limit: number
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const timesheetKeys = {
  all: ['timesheets'] as const,
  list: (params: Record<string, unknown>) => [...timesheetKeys.all, 'list', params] as const,
}

function useTimesheets(params: {
  locationId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}) {
  const qs = new URLSearchParams()
  if (params.locationId) qs.set('locationId', params.locationId)
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params.dateTo) qs.set('dateTo', params.dateTo)
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))

  return useQuery({
    queryKey: timesheetKeys.list(params as Record<string, unknown>),
    queryFn: () =>
      api.get<TimesheetResponse>(`/timesheets${qs.toString() ? `?${qs}` : ''}`),
  })
}

function useApproveEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<TimesheetEntry>(`/time-entries/${id}/approve`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timesheetKeys.all })
    },
  })
}

function useRejectEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<TimesheetEntry>(`/time-entries/${id}/reject`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timesheetKeys.all })
    },
  })
}

function useBulkApprove() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => api.post<void>('/time-entries/bulk-approve', { ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timesheetKeys.all })
    },
  })
}

function useUpdateTimeEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      clockedInAt,
      clockedOutAt,
    }: {
      id: string
      clockedInAt: string
      clockedOutAt: string
    }) => api.patch<TimesheetEntry>(`/time-entries/${id}`, { clockedInAt, clockedOutAt }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timesheetKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25

function toLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  // Convert to local datetime-local value
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmt(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusBadge(status: TimeEntryStatus) {
  if (status === 'approved')
    return (
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 border-green-200">
        Approved
      </span>
    )
  if (status === 'rejected')
    return (
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 border-red-200">
        Rejected
      </span>
    )
  return (
    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-700 border-yellow-200">
      Pending
    </span>
  )
}

// ---------------------------------------------------------------------------
// Inline edit row
// ---------------------------------------------------------------------------

function EditableRow({
  entry,
  onDone,
}: {
  entry: TimesheetEntry
  onDone: () => void
}) {
  const updateEntry = useUpdateTimeEntry()
  const [clockIn, setClockIn] = useState(toLocalInput(entry.clockedInAt))
  const [clockOut, setClockOut] = useState(toLocalInput(entry.clockedOutAt))

  const handleSave = () => {
    updateEntry.mutate(
      {
        id: entry.id,
        clockedInAt: new Date(clockIn).toISOString(),
        clockedOutAt: new Date(clockOut).toISOString(),
      },
      { onSuccess: onDone },
    )
  }

  return (
    <tr className="bg-sky-50">
      <td className="px-4 py-2 font-medium text-slate-900">{entry.employeeName ?? entry.employeeId}</td>
      <td className="px-4 py-2">
        <Input
          type="datetime-local"
          className="w-48"
          value={clockIn}
          onChange={(e) => setClockIn(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="datetime-local"
          className="w-48"
          value={clockOut}
          onChange={(e) => setClockOut(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">{entry.breakMinutes} min</td>
      <td className="px-4 py-2">{entry.regularHours.toFixed(2)}</td>
      <td className="px-4 py-2">{entry.overtimeHours.toFixed(2)}</td>
      <td className="px-4 py-2">${entry.grossPay.toFixed(2)}</td>
      <td className="px-4 py-2">{statusBadge(entry.status)}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-green-600"
            disabled={updateEntry.isPending}
            onClick={handleSave}
          >
            <Check size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-400"
            onClick={onDone}
          >
            <X size={13} />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

function exportCSV(entries: TimesheetEntry[]) {
  const headers = [
    'Employee',
    'Clock In',
    'Clock Out',
    'Break (min)',
    'Regular Hours',
    'OT Hours',
    'Gross Pay',
    'Status',
  ]
  const rows = entries.map((e) => [
    e.employeeName ?? e.employeeId,
    e.clockedInAt,
    e.clockedOutAt ?? '',
    String(e.breakMinutes),
    e.regularHours.toFixed(2),
    e.overtimeHours.toFixed(2),
    e.grossPay.toFixed(2),
    e.status,
  ])
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `timesheets-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function TimesheetsPage() {
  const [locationId, setLocationId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const approveEntry = useApproveEntry()
  const rejectEntry = useRejectEntry()
  const bulkApprove = useBulkApprove()

  const { data, isLoading, isError } = useTimesheets({
    locationId: locationId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: PAGE_SIZE,
  })

  const entries: TimesheetEntry[] = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pendingEntries = entries.filter((e) => e.status === 'pending')

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingEntries.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingEntries.map((e) => e.id)))
    }
  }

  const handleBulkApprove = () => {
    bulkApprove.mutate(Array.from(selectedIds), {
      onSuccess: () => setSelectedIds(new Set()),
    })
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="ts-loc" className="text-xs">Location</Label>
              <Input
                id="ts-loc"
                placeholder="Location ID"
                className="w-44"
                value={locationId}
                onChange={(e) => { setLocationId(e.target.value); setPage(1) }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ts-from" className="text-xs">From</Label>
              <Input
                id="ts-from"
                type="date"
                className="w-36"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ts-to" className="text-xs">To</Label>
              <Input
                id="ts-to"
                type="date"
                className="w-36"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-500"
              onClick={() => {
                setLocationId('')
                setDateFrom('')
                setDateTo('')
                setPage(1)
              }}
            >
              <X size={14} className="mr-1" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={bulkApprove.isPending}
            >
              <CheckSquare size={14} className="mr-1.5" />
              {bulkApprove.isPending ? 'Approving…' : `Approve ${selectedIds.size} selected`}
            </Button>
          )}
          {pendingEntries.length > 0 && selectedIds.size === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
            >
              Select all pending ({pendingEntries.length})
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={entries.length === 0}
          onClick={() => exportCSV(entries)}
        >
          <Download size={14} className="mr-1.5" />
          Export CSV (Gusto/ADP)
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} time entr${total !== 1 ? 'ies' : 'y'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={
                        pendingEntries.length > 0 && selectedIds.size === pendingEntries.length
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {[
                    'Employee',
                    'Clock In',
                    'Clock Out',
                    'Break',
                    'Reg Hrs',
                    'OT Hrs',
                    'Gross Pay',
                    'Status',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Loading timesheets…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-red-500 text-sm">
                      Failed to load timesheets.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && entries.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No time entries found.
                    </td>
                  </tr>
                )}
                {entries.map((entry) => {
                  if (editingId === entry.id) {
                    return (
                      <tr key={entry.id} className="bg-sky-50">
                        <td className="px-4 py-2" />
                        <EditableRow
                          entry={entry}
                          onDone={() => setEditingId(null)}
                        />
                      </tr>
                    )
                  }

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        {entry.status === 'pending' && (
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={selectedIds.has(entry.id)}
                            onChange={() => toggleSelect(entry.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {entry.employeeName ?? entry.employeeId}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {fmt(entry.clockedInAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {fmt(entry.clockedOutAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{entry.breakMinutes} min</td>
                      <td className="px-4 py-3 text-slate-700">{entry.regularHours.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {entry.overtimeHours > 0 ? (
                          <span className="text-amber-600 font-medium">
                            {entry.overtimeHours.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        ${entry.grossPay.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">{statusBadge(entry.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {entry.status === 'pending' && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-600 hover:bg-green-50"
                                disabled={approveEntry.isPending}
                                onClick={() => approveEntry.mutate(entry.id)}
                                title="Approve"
                              >
                                <Check size={13} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-500 hover:bg-red-50"
                                disabled={rejectEntry.isPending}
                                onClick={() => rejectEntry.mutate(entry.id)}
                                title="Reject"
                              >
                                <X size={13} />
                              </Button>
                            </>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            onClick={() => setEditingId(entry.id)}
                            title="Edit times"
                          >
                            <Pencil size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
