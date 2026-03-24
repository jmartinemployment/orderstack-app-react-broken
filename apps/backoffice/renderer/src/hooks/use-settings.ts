import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types — Tenant
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string
  name: string
  slug: string
  logoUrl?: string
  timezone: string
  currency: string
  locale: string
  taxRate: number
  taxInclusive: boolean
  plan: 'starter' | 'growth' | 'enterprise'
  createdAt: string
  updatedAt: string
}

export interface UpdateTenantBody extends Partial<Omit<Tenant, 'id' | 'slug' | 'createdAt' | 'updatedAt' | 'plan'>> {
  id: string
}

// ---------------------------------------------------------------------------
// Types — Locations
// ---------------------------------------------------------------------------

export interface Location {
  id: string
  tenantId: string
  name: string
  address: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
  email?: string
  timezone: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateLocationBody {
  tenantId: string
  name: string
  address: string
  city: string
  state: string
  postalCode: string
  country: string
  phone?: string
  email?: string
  timezone?: string
  isActive?: boolean
}

export interface UpdateLocationBody extends Partial<Omit<CreateLocationBody, 'tenantId'>> {
  id: string
}

// ---------------------------------------------------------------------------
// Types — API Keys
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt?: string
  expiresAt?: string
  createdAt: string
}

export interface CreateApiKeyBody {
  name: string
  scopes: string[]
  expiresAt?: string
}

// The full key is only returned once on creation
export interface CreateApiKeyResponse extends ApiKey {
  key: string
}

// ---------------------------------------------------------------------------
// Types — Webhooks
// ---------------------------------------------------------------------------

export interface Webhook {
  id: string
  url: string
  events: string[]
  isActive: boolean
  secret?: string
  createdAt: string
  updatedAt: string
}

export interface CreateWebhookBody {
  url: string
  events: string[]
  isActive?: boolean
  secret?: string
}

export interface UpdateWebhookBody extends Partial<CreateWebhookBody> {
  id: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  url: string
  requestBody: Record<string, unknown>
  responseStatus?: number
  responseBody?: string
  durationMs?: number
  success: boolean
  attemptedAt: string
}

// ---------------------------------------------------------------------------
// Types — GL / Accounting
// ---------------------------------------------------------------------------

export interface GlAccount {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  parentId?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface GlExport {
  id: string
  status: 'pending' | 'processing' | 'complete' | 'failed'
  format: 'qbo' | 'csv' | 'json'
  dateFrom: string
  dateTo: string
  downloadUrl?: string
  error?: string
  createdAt: string
  completedAt?: string
}

export interface CreateGlExportBody {
  format: GlExport['format']
  dateFrom: string
  dateTo: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const tenantKeys = {
  all: ['tenant'] as const,
  detail: (tenantId: string) => [...tenantKeys.all, tenantId] as const,
}

export const locationKeys = {
  all: ['locations'] as const,
  byTenant: (tenantId: string) => [...locationKeys.all, tenantId] as const,
  detail: (id: string) => [...locationKeys.all, 'detail', id] as const,
}

export const apiKeyKeys = {
  all: ['apiKeys'] as const,
  lists: () => [...apiKeyKeys.all, 'list'] as const,
}

export const webhookKeys = {
  all: ['webhooks'] as const,
  lists: () => [...webhookKeys.all, 'list'] as const,
  detail: (id: string) => [...webhookKeys.all, 'detail', id] as const,
  deliveries: (webhookId: string) =>
    [...webhookKeys.all, 'deliveries', webhookId] as const,
}

export const accountingKeys = {
  all: ['accounting'] as const,
  chartOfAccounts: () => [...accountingKeys.all, 'chart-of-accounts'] as const,
  glExports: () => [...accountingKeys.all, 'gl-exports'] as const,
}

// ---------------------------------------------------------------------------
// Tenant Queries
// ---------------------------------------------------------------------------

export function useTenant(tenantId: string) {
  return useQuery({
    queryKey: tenantKeys.detail(tenantId),
    queryFn: () => api.get<Tenant>(`/tenants/${tenantId}`),
    enabled: Boolean(tenantId),
  })
}

// ---------------------------------------------------------------------------
// Tenant Mutations
// ---------------------------------------------------------------------------

export function useUpdateTenant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTenantBody) =>
      api.patch<Tenant>(`/tenants/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: tenantKeys.detail(variables.id),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Location Queries
// ---------------------------------------------------------------------------

export function useLocations(tenantId: string) {
  return useQuery({
    queryKey: locationKeys.byTenant(tenantId),
    queryFn: () =>
      api.get<Location[]>(`/locations?tenantId=${tenantId}`),
    enabled: Boolean(tenantId),
  })
}

// ---------------------------------------------------------------------------
// Location Mutations
// ---------------------------------------------------------------------------

export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateLocationBody) =>
      api.post<Location>('/locations', body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: locationKeys.byTenant(variables.tenantId),
      })
    },
  })
}

export function useUpdateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateLocationBody) =>
      api.patch<Location>(`/locations/${id}`, body),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: locationKeys.byTenant(data.tenantId),
      })
      void queryClient.invalidateQueries({
        queryKey: locationKeys.detail(data.id),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// API Key Queries
// ---------------------------------------------------------------------------

export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: () => api.get<ApiKey[]>('/api-keys'),
  })
}

// ---------------------------------------------------------------------------
// API Key Mutations
// ---------------------------------------------------------------------------

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateApiKeyBody) =>
      api.post<CreateApiKeyResponse>('/api-keys', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api-keys/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiKeyKeys.lists() })
    },
  })
}

// ---------------------------------------------------------------------------
// Webhook Queries
// ---------------------------------------------------------------------------

export function useWebhooks() {
  return useQuery({
    queryKey: webhookKeys.lists(),
    queryFn: () => api.get<Webhook[]>('/webhooks'),
  })
}

export function useWebhookDeliveries(webhookId: string) {
  return useQuery({
    queryKey: webhookKeys.deliveries(webhookId),
    queryFn: () =>
      api.get<WebhookDelivery[]>(`/webhooks/${webhookId}/deliveries`),
    enabled: Boolean(webhookId),
  })
}

// ---------------------------------------------------------------------------
// Webhook Mutations
// ---------------------------------------------------------------------------

export function useCreateWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateWebhookBody) =>
      api.post<Webhook>('/webhooks', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.lists() })
    },
  })
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateWebhookBody) =>
      api.patch<Webhook>(`/webhooks/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: webhookKeys.detail(variables.id),
      })
    },
  })
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/webhooks/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: webhookKeys.lists() })
    },
  })
}

// ---------------------------------------------------------------------------
// Accounting Queries
// ---------------------------------------------------------------------------

export function useChartOfAccounts() {
  return useQuery({
    queryKey: accountingKeys.chartOfAccounts(),
    queryFn: () => api.get<GlAccount[]>('/accounting/chart-of-accounts'),
  })
}

export function useGlExports() {
  return useQuery({
    queryKey: accountingKeys.glExports(),
    queryFn: () => api.get<GlExport[]>('/accounting/gl-exports'),
  })
}

// ---------------------------------------------------------------------------
// Accounting Mutations
// ---------------------------------------------------------------------------

export function useCreateGlExport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateGlExportBody) =>
      api.post<GlExport>('/accounting/gl-exports', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: accountingKeys.glExports(),
      })
    },
  })
}
