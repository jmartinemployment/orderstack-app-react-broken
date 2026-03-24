import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Category {
  id: string
  name: string
  description?: string
  parentId?: string
  sortOrder: number
  isActive: boolean
  imageUrl?: string
  children?: Category[]
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryBody {
  name: string
  description?: string
  parentId?: string
  sortOrder?: number
  isActive?: boolean
  imageUrl?: string
}

export interface UpdateCategoryBody extends Partial<CreateCategoryBody> {}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const categoryKeys = {
  all: ['categories'] as const,
  tree: () => [...categoryKeys.all, 'tree'] as const,
  detail: (id: string) => [...categoryKeys.all, 'detail', id] as const,
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.tree(),
    queryFn: () => api.get<Category[]>('/categories'),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCategoryBody) =>
      api.post<Category>('/categories', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryKeys.tree() })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateCategoryBody & { id: string }) =>
      api.patch<Category>(`/categories/${id}`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: categoryKeys.tree() })
      void queryClient.invalidateQueries({
        queryKey: categoryKeys.detail(variables.id),
      })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/categories/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryKeys.tree() })
    },
  })
}
