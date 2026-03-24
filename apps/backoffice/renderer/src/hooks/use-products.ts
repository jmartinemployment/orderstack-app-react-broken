import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductVariant {
  id: string
  productId: string
  sku: string
  name: string
  price: number
  compareAtPrice?: number
  cost?: number
  barcode?: string
  trackInventory: boolean
  isActive: boolean
  attributes: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  description?: string
  categoryId?: string
  productType: 'standard' | 'variant' | 'bundle' | 'modifier'
  isActive: boolean
  imageUrl?: string
  taxable: boolean
  variants: ProductVariant[]
  createdAt: string
  updatedAt: string
}

export interface ProductsResponse {
  data: Product[]
  total: number
  page: number
  limit: number
}

export interface ProductsParams {
  search?: string
  categoryId?: string
  isActive?: boolean
  productType?: Product['productType']
  page?: number
  limit?: number
}

export interface CreateProductBody {
  name: string
  description?: string
  categoryId?: string
  productType: Product['productType']
  isActive?: boolean
  imageUrl?: string
  taxable?: boolean
}

export interface UpdateProductBody extends Partial<CreateProductBody> {}

export interface CreateVariantBody {
  sku: string
  name: string
  price: number
  compareAtPrice?: number
  cost?: number
  barcode?: string
  trackInventory?: boolean
  isActive?: boolean
  attributes?: Record<string, string>
}

export interface UpdateVariantBody extends Partial<CreateVariantBody> {
  id: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ProductsParams) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function buildProductsQueryString(params: ProductsParams): string {
  const qs = new URLSearchParams()
  if (params.search !== undefined) qs.set('search', params.search)
  if (params.categoryId !== undefined) qs.set('categoryId', params.categoryId)
  if (params.isActive !== undefined) qs.set('isActive', String(params.isActive))
  if (params.productType !== undefined) qs.set('productType', params.productType)
  if (params.page !== undefined) qs.set('page', String(params.page))
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  const str = qs.toString()
  return str ? `?${str}` : ''
}

export function useProducts(params: ProductsParams = {}) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () =>
      api.get<ProductsResponse>(`/products${buildProductsQueryString(params)}`),
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => api.get<Product>(`/products/${id}`),
    enabled: Boolean(id),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateProductBody) =>
      api.post<Product>('/products', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateProductBody & { id: string }) =>
      api.patch<Product>(`/products/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      void queryClient.invalidateQueries({
        queryKey: productKeys.detail(variables.id),
      })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/products/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    },
  })
}

export function useCreateVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateVariantBody) =>
      api.post<ProductVariant>(`/products/${productId}/variants`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: productKeys.detail(productId),
      })
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() })
    },
  })
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateVariantBody) =>
      api.patch<ProductVariant>(`/products/${productId}/variants/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: productKeys.detail(productId),
      })
    },
  })
}
