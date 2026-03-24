import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InventoryLevel {
  variantId: string
  locationId: string
  quantityOnHand: number
  quantityReserved: number
  quantityAvailable: number
  reorderPoint?: number
  reorderQuantity?: number
  updatedAt: string
}

export interface InventoryAdjustment {
  id: string
  variantId: string
  locationId: string
  adjustmentType: 'manual' | 'purchase_order' | 'sale' | 'waste' | 'transfer'
  quantity: number
  quantityBefore: number
  quantityAfter: number
  reason?: string
  referenceId?: string
  employeeId: string
  createdAt: string
}

export interface AdjustmentsParams {
  locationId?: string
  variantId?: string
  adjustmentType?: InventoryAdjustment['adjustmentType']
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface CreateAdjustmentBody {
  variantId: string
  locationId: string
  adjustmentType: InventoryAdjustment['adjustmentType']
  quantity: number
  reason?: string
  referenceId?: string
}

export interface AdjustmentsResponse {
  data: InventoryAdjustment[]
  total: number
  page: number
  limit: number
}

// Purchase Orders
export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'received'
  | 'cancelled'

export interface PurchaseOrderLineItem {
  id: string
  variantId: string
  name: string
  sku: string
  orderedQuantity: number
  receivedQuantity: number
  unitCost: number
  total: number
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  vendorId: string
  locationId: string
  status: PurchaseOrderStatus
  lineItems: PurchaseOrderLineItem[]
  subtotal: number
  taxAmount: number
  total: number
  notes?: string
  expectedAt?: string
  createdAt: string
  updatedAt: string
}

export interface PurchaseOrdersResponse {
  data: PurchaseOrder[]
  total: number
  page: number
  limit: number
}

export interface PurchaseOrdersParams {
  vendorId?: string
  locationId?: string
  status?: PurchaseOrderStatus
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface CreatePurchaseOrderBody {
  vendorId: string
  locationId: string
  lineItems: Array<{
    variantId: string
    orderedQuantity: number
    unitCost: number
  }>
  notes?: string
  expectedAt?: string
}

export interface UpdatePurchaseOrderBody
  extends Partial<Omit<CreatePurchaseOrderBody, 'lineItems'>> {
  id: string
  lineItems?: Array<{
    id?: string
    variantId: string
    orderedQuantity: number
    unitCost: number
  }>
}

export interface ReceivePurchaseOrderBody {
  id: string
  lineItems: Array<{ lineItemId: string; receivedQuantity: number }>
  notes?: string
}

// Vendors
export interface Vendor {
  id: string
  name: string
  contactName?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface VendorsResponse {
  data: Vendor[]
  total: number
  page: number
  limit: number
}

export interface VendorsParams {
  search?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface CreateVendorBody {
  name: string
  contactName?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  isActive?: boolean
}

export interface UpdateVendorBody extends Partial<CreateVendorBody> {
  id: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const inventoryKeys = {
  all: ['inventory'] as const,
  levels: (locationId: string) =>
    [...inventoryKeys.all, 'levels', locationId] as const,
  adjustments: () => [...inventoryKeys.all, 'adjustments'] as const,
  adjustmentsList: (params?: AdjustmentsParams) =>
    [...inventoryKeys.adjustments(), params] as const,
}

export const purchaseOrderKeys = {
  all: ['purchaseOrders'] as const,
  lists: () => [...purchaseOrderKeys.all, 'list'] as const,
  list: (params?: PurchaseOrdersParams) =>
    [...purchaseOrderKeys.lists(), params] as const,
  details: () => [...purchaseOrderKeys.all, 'detail'] as const,
  detail: (id: string) => [...purchaseOrderKeys.details(), id] as const,
}

export const vendorKeys = {
  all: ['vendors'] as const,
  lists: () => [...vendorKeys.all, 'list'] as const,
  list: (params?: VendorsParams) => [...vendorKeys.lists(), params] as const,
  details: () => [...vendorKeys.all, 'detail'] as const,
  detail: (id: string) => [...vendorKeys.details(), id] as const,
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
// Inventory Queries
// ---------------------------------------------------------------------------

export function useInventory(locationId: string) {
  return useQuery({
    queryKey: inventoryKeys.levels(locationId),
    queryFn: () =>
      api.get<InventoryLevel[]>(`/inventory?locationId=${locationId}`),
    enabled: Boolean(locationId),
  })
}

export function useInventoryAdjustments(params?: AdjustmentsParams) {
  return useQuery({
    queryKey: inventoryKeys.adjustmentsList(params),
    queryFn: () =>
      api.get<AdjustmentsResponse>(
        `/inventory/adjustments${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

// ---------------------------------------------------------------------------
// Inventory Mutations
// ---------------------------------------------------------------------------

export function useCreateAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAdjustmentBody) =>
      api.post<InventoryAdjustment>('/inventory/adjustments', body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: inventoryKeys.levels(variables.locationId),
      })
      void queryClient.invalidateQueries({
        queryKey: inventoryKeys.adjustments(),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Purchase Order Queries
// ---------------------------------------------------------------------------

export function usePurchaseOrders(params?: PurchaseOrdersParams) {
  return useQuery({
    queryKey: purchaseOrderKeys.list(params),
    queryFn: () =>
      api.get<PurchaseOrdersResponse>(
        `/purchase-orders${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: purchaseOrderKeys.detail(id),
    queryFn: () => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
    enabled: Boolean(id),
  })
}

// ---------------------------------------------------------------------------
// Purchase Order Mutations
// ---------------------------------------------------------------------------

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePurchaseOrderBody) =>
      api.post<PurchaseOrder>('/purchase-orders', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.lists(),
      })
    },
  })
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdatePurchaseOrderBody) =>
      api.patch<PurchaseOrder>(`/purchase-orders/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.lists(),
      })
      void queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.detail(variables.id),
      })
    },
  })
}

export function useReceivePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ReceivePurchaseOrderBody) =>
      api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.lists(),
      })
      void queryClient.invalidateQueries({
        queryKey: purchaseOrderKeys.detail(variables.id),
      })
      // Receiving stock changes inventory levels so invalidate all level caches
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Vendor Queries
// ---------------------------------------------------------------------------

export function useVendors(params?: VendorsParams) {
  return useQuery({
    queryKey: vendorKeys.list(params),
    queryFn: () =>
      api.get<VendorsResponse>(
        `/vendors${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

// ---------------------------------------------------------------------------
// Vendor Mutations
// ---------------------------------------------------------------------------

export function useCreateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateVendorBody) => api.post<Vendor>('/vendors', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.lists() })
    },
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateVendorBody) =>
      api.patch<Vendor>(`/vendors/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: vendorKeys.detail(variables.id),
      })
    },
  })
}
