import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeviceType = 'pos' | 'kds' | 'kiosk' | 'backoffice'
export type DeviceStatus = 'active' | 'inactive' | 'revoked'

export interface Device {
  id: string
  name: string
  deviceType: DeviceType
  status: DeviceStatus
  locationId?: string
  fingerprint: string
  lastSeenAt?: string
  registeredAt: string
  revokedAt?: string
}

export interface RegisterDeviceBody {
  name: string
  deviceType: DeviceType
  locationId?: string
  fingerprint: string
  certificate: string
}

export interface DeviceAccessLogEntry {
  id: string
  deviceId: string
  action: 'login' | 'logout' | 'api_request' | 'revoke'
  ipAddress?: string
  userAgent?: string
  employeeId?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const deviceKeys = {
  all: ['devices'] as const,
  lists: () => [...deviceKeys.all, 'list'] as const,
  details: () => [...deviceKeys.all, 'detail'] as const,
  detail: (id: string) => [...deviceKeys.details(), id] as const,
  accessLog: (deviceId: string) =>
    [...deviceKeys.all, 'access-log', deviceId] as const,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useDevices() {
  return useQuery({
    queryKey: deviceKeys.lists(),
    queryFn: () => api.get<Device[]>('/devices'),
  })
}

export function useDeviceAccessLog(deviceId: string) {
  return useQuery({
    queryKey: deviceKeys.accessLog(deviceId),
    queryFn: () =>
      api.get<DeviceAccessLogEntry[]>(`/devices/${deviceId}/access-log`),
    enabled: Boolean(deviceId),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useRegisterDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RegisterDeviceBody) =>
      api.post<Device>('/devices/register', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() })
    },
  })
}

export function useRevokeDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/devices/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: deviceKeys.lists() })
    },
  })
}
