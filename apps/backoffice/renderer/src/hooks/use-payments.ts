import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'gift_card'
  | 'loyalty'
  | 'external'

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'partial_refund'

export interface Payment {
  id: string
  orderId: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  tipAmount: number
  refundedAmount: number
  referenceNumber?: string
  processorResponse?: Record<string, unknown>
  locationId: string
  employeeId: string
  createdAt: string
  updatedAt: string
}

export interface PaymentsResponse {
  data: Payment[]
  total: number
  page: number
  limit: number
}

export interface PaymentsParams {
  method?: PaymentMethod
  status?: PaymentStatus
  locationId?: string
  orderId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface RefundPaymentBody {
  id: string
  amount: number
  reason?: string
}

// Cash Drawers
export interface CashDrawer {
  id: string
  locationId: string
  name: string
  currentBalance: number
  status: 'open' | 'closed'
  openedAt?: string
  closedAt?: string
  openingBalance?: number
  closingBalance?: number
  openedBy?: string
  closedBy?: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (params?: PaymentsParams) => [...paymentKeys.lists(), params] as const,
  details: () => [...paymentKeys.all, 'detail'] as const,
  detail: (id: string) => [...paymentKeys.details(), id] as const,
}

export const cashDrawerKeys = {
  all: ['cashDrawers'] as const,
  byLocation: (locationId: string) =>
    [...cashDrawerKeys.all, locationId] as const,
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
// Queries
// ---------------------------------------------------------------------------

export function usePayments(params?: PaymentsParams) {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: () =>
      api.get<PaymentsResponse>(
        `/payments${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: paymentKeys.detail(id),
    queryFn: () => api.get<Payment>(`/payments/${id}`),
    enabled: Boolean(id),
  })
}

export function useCashDrawers(locationId: string) {
  return useQuery({
    queryKey: cashDrawerKeys.byLocation(locationId),
    queryFn: () =>
      api.get<CashDrawer[]>(`/cash-drawers?locationId=${locationId}`),
    enabled: Boolean(locationId),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useRefundPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: RefundPaymentBody) =>
      api.post<Payment>(`/payments/${id}/refund`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: paymentKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: paymentKeys.detail(variables.id),
      })
    },
  })
}
