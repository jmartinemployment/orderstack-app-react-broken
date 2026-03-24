import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmployeeRole = 'admin' | 'manager' | 'cashier' | 'kitchen' | 'driver'

export interface Employee {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  role: EmployeeRole
  locationIds: string[]
  isActive: boolean
  hireDate?: string
  hourlyRate?: number
  pinEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface EmployeesResponse {
  data: Employee[]
  total: number
  page: number
  limit: number
}

export interface EmployeesParams {
  search?: string
  role?: EmployeeRole
  locationId?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface CreateEmployeeBody {
  firstName: string
  lastName: string
  email: string
  phone?: string
  role: EmployeeRole
  locationIds: string[]
  isActive?: boolean
  hireDate?: string
  hourlyRate?: number
}

export interface UpdateEmployeeBody extends Partial<CreateEmployeeBody> {
  id: string
}

export interface SetEmployeePinBody {
  id: string
  pin: string
}

// Time Entries
export interface TimeEntry {
  id: string
  employeeId: string
  locationId: string
  clockedInAt: string
  clockedOutAt?: string
  breakMinutes: number
  regularHours: number
  overtimeHours: number
  notes?: string
}

export interface TimeEntriesParams {
  dateFrom?: string
  dateTo?: string
  locationId?: string
  page?: number
  limit?: number
}

export interface TimeEntriesResponse {
  data: TimeEntry[]
  total: number
  page: number
  limit: number
}

// Schedules
export interface Schedule {
  id: string
  locationId: string
  weekOf: string
  publishedAt?: string
  publishedBy?: string
  createdAt: string
  updatedAt: string
}

export interface SchedulesResponse {
  data: Schedule[]
  total: number
  page: number
  limit: number
}

export interface SchedulesParams {
  locationId: string
  weekOf?: string
}

export interface CreateScheduleBody {
  locationId: string
  weekOf: string
}

export interface PublishScheduleBody {
  id: string
}

// Shifts
export interface Shift {
  id: string
  scheduleId: string
  employeeId: string
  locationId: string
  date: string
  startTime: string
  endTime: string
  role: EmployeeRole
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CreateShiftBody {
  employeeId: string
  locationId: string
  date: string
  startTime: string
  endTime: string
  role?: EmployeeRole
  notes?: string
}

export interface UpdateShiftBody extends Partial<CreateShiftBody> {
  id: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (params?: EmployeesParams) => [...employeeKeys.lists(), params] as const,
  details: () => [...employeeKeys.all, 'detail'] as const,
  detail: (id: string) => [...employeeKeys.details(), id] as const,
  timeEntries: (employeeId: string, params?: TimeEntriesParams) =>
    [...employeeKeys.all, 'time-entries', employeeId, params] as const,
}

export const scheduleKeys = {
  all: ['schedules'] as const,
  lists: () => [...scheduleKeys.all, 'list'] as const,
  list: (params: SchedulesParams) => [...scheduleKeys.lists(), params] as const,
  details: () => [...scheduleKeys.all, 'detail'] as const,
  detail: (id: string) => [...scheduleKeys.details(), id] as const,
  shifts: (scheduleId: string) =>
    [...scheduleKeys.all, 'shifts', scheduleId] as const,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      qs.set(key, String(value))
    }
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

// ---------------------------------------------------------------------------
// Employee Queries
// ---------------------------------------------------------------------------

export function useEmployees(params?: EmployeesParams) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () =>
      api.get<EmployeesResponse>(
        `/employees${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: () => api.get<Employee>(`/employees/${id}`),
    enabled: Boolean(id),
  })
}

export function useEmployeeTimeEntries(
  employeeId: string,
  params?: TimeEntriesParams,
) {
  return useQuery({
    queryKey: employeeKeys.timeEntries(employeeId, params),
    queryFn: () =>
      api.get<TimeEntriesResponse>(
        `/employees/${employeeId}/time-entries${toQueryString(
          params as Record<string, unknown>,
        )}`,
      ),
    enabled: Boolean(employeeId),
  })
}

// ---------------------------------------------------------------------------
// Employee Mutations
// ---------------------------------------------------------------------------

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateEmployeeBody) =>
      api.post<Employee>('/employees', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.lists() })
    },
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateEmployeeBody) =>
      api.patch<Employee>(`/employees/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: employeeKeys.detail(variables.id),
      })
    },
  })
}

export function useSetEmployeePin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: SetEmployeePinBody) =>
      api.patch<Employee>(`/employees/${id}/pin`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: employeeKeys.detail(variables.id),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Schedule Queries
// ---------------------------------------------------------------------------

export function useSchedules(params: SchedulesParams) {
  return useQuery({
    queryKey: scheduleKeys.list(params),
    queryFn: () =>
      api.get<SchedulesResponse>(
        `/schedules${toQueryString(params as Record<string, unknown>)}`,
      ),
    enabled: Boolean(params.locationId),
  })
}

export function useScheduleShifts(scheduleId: string) {
  return useQuery({
    queryKey: scheduleKeys.shifts(scheduleId),
    queryFn: () => api.get<Shift[]>(`/schedules/${scheduleId}/shifts`),
    enabled: Boolean(scheduleId),
  })
}

// ---------------------------------------------------------------------------
// Schedule Mutations
// ---------------------------------------------------------------------------

export function useCreateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateScheduleBody) =>
      api.post<Schedule>('/schedules', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() })
    },
  })
}

export function usePublishSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: PublishScheduleBody) =>
      api.post<Schedule>(`/schedules/${id}/publish`, {}),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.detail(variables.id),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Shift Mutations
// ---------------------------------------------------------------------------

export function useCreateShift(scheduleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShiftBody) =>
      api.post<Shift>(`/schedules/${scheduleId}/shifts`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.shifts(scheduleId),
      })
    },
  })
}

export function useUpdateShift() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateShiftBody) =>
      api.patch<Shift>(`/shifts/${id}`, body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.shifts(data.scheduleId),
      })
    },
  })
}

export function useDeleteShift() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduleId }: { id: string; scheduleId: string }) =>
      api.delete<void>(`/shifts/${id}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: scheduleKeys.shifts(variables.scheduleId),
      })
    },
  })
}
