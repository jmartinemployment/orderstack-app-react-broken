import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'completed'
  | 'voided'
  | 'refunded'

export type OrderType = 'dine_in' | 'takeout' | 'delivery' | 'online'

export interface OrderLineItem {
  id: string
  productId: string
  variantId: string
  name: string
  sku: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  subtotal: number
  notes?: string
  modifiers: Array<{ id: string; name: string; price: number }>
}

export interface Order {
  id: string
  orderNumber: string
  status: OrderStatus
  orderType: OrderType
  locationId: string
  customerId?: string
  employeeId?: string
  lineItems: OrderLineItem[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  notes?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  voidedAt?: string
  voidReason?: string
}

export interface OrdersResponse {
  data: Order[]
  total: number
  page: number
  limit: number
}

export interface OrdersParams {
  status?: OrderStatus
  orderType?: OrderType
  locationId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface UpdateOrderStatusBody {
  id: string
  status: OrderStatus
  reason?: string
}

export interface VoidOrderBody {
  id: string
  reason: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params: OrdersParams) => [...orderKeys.lists(), params] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOrdersQueryString(params: OrdersParams): string {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.orderType) qs.set('orderType', params.orderType)
  if (params.locationId) qs.set('locationId', params.locationId)
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom)
  if (params.dateTo) qs.set('dateTo', params.dateTo)
  if (params.page !== undefined) qs.set('page', String(params.page))
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  const str = qs.toString()
  return str ? `?${str}` : ''
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useOrders(params: OrdersParams = {}) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () =>
      api.get<OrdersResponse>(`/orders${buildOrdersQueryString(params)}`),
  })
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => api.get<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateOrderStatusBody) =>
      api.patch<Order>(`/orders/${id}/status`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: orderKeys.detail(variables.id),
      })
    },
  })
}

export function useVoidOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: VoidOrderBody) =>
      api.post<Order>(`/orders/${id}/void`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: orderKeys.detail(variables.id),
      })
    },
  })
}
