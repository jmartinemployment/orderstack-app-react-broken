import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types — Customers
// ---------------------------------------------------------------------------

export interface Customer {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  notes?: string
  marketingOptIn: boolean
  loyaltyAccountId?: string
  createdAt: string
  updatedAt: string
}

export interface CustomersResponse {
  data: Customer[]
  total: number
  page: number
  limit: number
}

export interface CustomersParams {
  search?: string
  page?: number
  limit?: number
}

export interface CreateCustomerBody {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  notes?: string
  marketingOptIn?: boolean
}

export interface UpdateCustomerBody extends Partial<CreateCustomerBody> {
  id: string
}

export interface CustomerOrdersParams {
  status?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Types — Loyalty
// ---------------------------------------------------------------------------

export interface LoyaltyAccount {
  id: string
  customerId: string
  programId: string
  pointsBalance: number
  lifetimePoints: number
  tier?: string
  createdAt: string
  updatedAt: string
}

export interface LoyaltyProgram {
  id: string
  name: string
  pointsPerDollar: number
  dollarValuePerPoint: number
  minimumRedemption: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateLoyaltyProgramBody {
  name: string
  pointsPerDollar: number
  dollarValuePerPoint: number
  minimumRedemption?: number
  isActive?: boolean
}

export interface UpdateLoyaltyProgramBody
  extends Partial<CreateLoyaltyProgramBody> {
  id: string
}

export interface AdjustLoyaltyPointsBody {
  customerId: string
  points: number
  reason: string
}

// ---------------------------------------------------------------------------
// Types — Gift Cards
// ---------------------------------------------------------------------------

export interface GiftCard {
  id: string
  code: string
  balance: number
  initialBalance: number
  isActive: boolean
  customerId?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

export interface GiftCardsResponse {
  data: GiftCard[]
  total: number
  page: number
  limit: number
}

export interface GiftCardsParams {
  search?: string
  isActive?: boolean
  page?: number
  limit?: number
}

export interface CreateGiftCardBody {
  initialBalance: number
  customerId?: string
  expiresAt?: string
}

export interface ReloadGiftCardBody {
  id: string
  amount: number
}

// ---------------------------------------------------------------------------
// Types — Campaigns
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string
  name: string
  type: 'email' | 'sms' | 'push'
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled'
  audience: string
  subject?: string
  body: string
  scheduledAt?: string
  sentAt?: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Types — Discounts
// ---------------------------------------------------------------------------

export type DiscountType = 'percentage' | 'fixed_amount' | 'bogo' | 'free_item'

export interface Discount {
  id: string
  name: string
  code?: string
  discountType: DiscountType
  value: number
  minimumOrderAmount?: number
  maxRedemptions?: number
  redemptionCount: number
  isActive: boolean
  startsAt?: string
  endsAt?: string
  createdAt: string
  updatedAt: string
}

export interface DiscountsResponse {
  data: Discount[]
  total: number
  page: number
  limit: number
}

export interface DiscountsParams {
  search?: string
  discountType?: DiscountType
  isActive?: boolean
  page?: number
  limit?: number
}

export interface CreateDiscountBody {
  name: string
  code?: string
  discountType: DiscountType
  value: number
  minimumOrderAmount?: number
  maxRedemptions?: number
  isActive?: boolean
  startsAt?: string
  endsAt?: string
}

export interface UpdateDiscountBody extends Partial<CreateDiscountBody> {
  id: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params?: CustomersParams) => [...customerKeys.lists(), params] as const,
  search: (q: string) => [...customerKeys.all, 'search', q] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
  orders: (customerId: string, params?: CustomerOrdersParams) =>
    [...customerKeys.all, 'orders', customerId, params] as const,
  loyalty: (customerId: string) =>
    [...customerKeys.all, 'loyalty', customerId] as const,
}

export const loyaltyProgramKeys = {
  all: ['loyaltyPrograms'] as const,
  lists: () => [...loyaltyProgramKeys.all, 'list'] as const,
  detail: (id: string) => [...loyaltyProgramKeys.all, 'detail', id] as const,
}

export const giftCardKeys = {
  all: ['giftCards'] as const,
  lists: () => [...giftCardKeys.all, 'list'] as const,
  list: (params?: GiftCardsParams) => [...giftCardKeys.lists(), params] as const,
}

export const campaignKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignKeys.all, 'list'] as const,
}

export const discountKeys = {
  all: ['discounts'] as const,
  lists: () => [...discountKeys.all, 'list'] as const,
  list: (params?: DiscountsParams) =>
    [...discountKeys.lists(), params] as const,
  detail: (id: string) => [...discountKeys.all, 'detail', id] as const,
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
// Customer Queries
// ---------------------------------------------------------------------------

export function useCustomers(params?: CustomersParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () =>
      api.get<CustomersResponse>(
        `/customers${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => api.get<Customer>(`/customers/${id}`),
    enabled: Boolean(id),
  })
}

export function useSearchCustomers(q: string) {
  return useQuery({
    queryKey: customerKeys.search(q),
    queryFn: () =>
      api.get<Customer[]>(`/customers/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  })
}

export function useCustomerOrders(
  customerId: string,
  params?: CustomerOrdersParams,
) {
  return useQuery({
    queryKey: customerKeys.orders(customerId, params),
    queryFn: () =>
      api.get<CustomersResponse>(
        `/customers/${customerId}/orders${toQueryString(
          params as Record<string, unknown>,
        )}`,
      ),
    enabled: Boolean(customerId),
  })
}

export function useCustomerLoyalty(customerId: string) {
  return useQuery({
    queryKey: customerKeys.loyalty(customerId),
    queryFn: () =>
      api.get<LoyaltyAccount>(`/loyalty/accounts/${customerId}`),
    enabled: Boolean(customerId),
  })
}

// ---------------------------------------------------------------------------
// Customer Mutations
// ---------------------------------------------------------------------------

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCustomerBody) =>
      api.post<Customer>('/customers', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCustomerBody) =>
      api.patch<Customer>(`/customers/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: customerKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: customerKeys.detail(variables.id),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Loyalty Program Queries
// ---------------------------------------------------------------------------

export function useLoyaltyPrograms() {
  return useQuery({
    queryKey: loyaltyProgramKeys.lists(),
    queryFn: () => api.get<LoyaltyProgram[]>('/loyalty/programs'),
  })
}

// ---------------------------------------------------------------------------
// Loyalty Program Mutations
// ---------------------------------------------------------------------------

export function useCreateLoyaltyProgram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateLoyaltyProgramBody) =>
      api.post<LoyaltyProgram>('/loyalty/programs', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.lists(),
      })
    },
  })
}

export function useUpdateLoyaltyProgram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateLoyaltyProgramBody) =>
      api.patch<LoyaltyProgram>(`/loyalty/programs/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.lists(),
      })
      void queryClient.invalidateQueries({
        queryKey: loyaltyProgramKeys.detail(variables.id),
      })
    },
  })
}

export function useAdjustLoyaltyPoints() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, ...body }: AdjustLoyaltyPointsBody) =>
      api.post<LoyaltyAccount>(
        `/loyalty/accounts/${customerId}/adjust`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: customerKeys.loyalty(variables.customerId),
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Gift Card Queries
// ---------------------------------------------------------------------------

export function useGiftCards(params?: GiftCardsParams) {
  return useQuery({
    queryKey: giftCardKeys.list(params),
    queryFn: () =>
      api.get<GiftCardsResponse>(
        `/gift-cards${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

// ---------------------------------------------------------------------------
// Gift Card Mutations
// ---------------------------------------------------------------------------

export function useCreateGiftCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateGiftCardBody) =>
      api.post<GiftCard>('/gift-cards', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: giftCardKeys.lists() })
    },
  })
}

export function useReloadGiftCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: ReloadGiftCardBody) =>
      api.post<GiftCard>(`/gift-cards/${id}/reload`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: giftCardKeys.lists() })
    },
  })
}

// ---------------------------------------------------------------------------
// Campaign Queries
// ---------------------------------------------------------------------------

export function useCampaigns() {
  return useQuery({
    queryKey: campaignKeys.lists(),
    queryFn: () => api.get<Campaign[]>('/campaigns'),
  })
}

// ---------------------------------------------------------------------------
// Discount Queries
// ---------------------------------------------------------------------------

export function useDiscounts(params?: DiscountsParams) {
  return useQuery({
    queryKey: discountKeys.list(params),
    queryFn: () =>
      api.get<DiscountsResponse>(
        `/discounts${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

// ---------------------------------------------------------------------------
// Discount Mutations
// ---------------------------------------------------------------------------

export function useCreateDiscount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateDiscountBody) =>
      api.post<Discount>('/discounts', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
    },
  })
}

export function useUpdateDiscount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateDiscountBody) =>
      api.patch<Discount>(`/discounts/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: discountKeys.detail(variables.id),
      })
    },
  })
}

export function useDeleteDiscount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/discounts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: discountKeys.lists() })
    },
  })
}
