import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ArrowRight, X, UtensilsCrossed } from 'lucide-react'
import { Button, Input, Label, Badge, Card, CardContent } from '@orderstack/ui'
import { api } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuType = 'dine_in' | 'takeout' | 'delivery' | 'online'

interface Menu {
  id: string
  name: string
  description: string | null
  type: MenuType
  createdAt: string
  updatedAt: string
}

interface MenusResponse {
  data: Menu[]
}

// ─── Inline hooks ─────────────────────────────────────────────────────────────

const menuKeys = {
  all: ['menus'] as const,
  list: () => [...menuKeys.all, 'list'] as const,
}

function useMenus() {
  return useQuery({
    queryKey: menuKeys.list(),
    queryFn: () => api.get<MenusResponse>('/menus'),
  })
}

function useCreateMenu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; type: MenuType; description?: string }) =>
      api.post<Menu>('/menus', body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: menuKeys.list() }),
  })
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const menuSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  type: z.enum(['dine_in', 'takeout', 'delivery', 'online']),
  description: z.string().optional(),
})

type MenuFormValues = z.infer<typeof menuSchema>

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  title: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function menuTypeBadgeVariant(
  type: MenuType,
): 'default' | 'secondary' | 'success' | 'warning' | 'outline' {
  switch (type) {
    case 'dine_in':
      return 'success'
    case 'delivery':
      return 'warning'
    case 'online':
      return 'default'
    default:
      return 'secondary'
  }
}

function menuTypeLabel(type: MenuType) {
  return type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MenusPage() {
  const navigate = useNavigate()
  const menusQuery = useMenus()
  const createMenu = useCreateMenu()

  const [modalOpen, setModalOpen] = useState(false)

  const menus = menusQuery.data?.data ?? []

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MenuFormValues>({
    resolver: zodResolver(menuSchema),
    defaultValues: { type: 'dine_in' },
  })

  async function onSubmit(values: MenuFormValues) {
    const menu = await createMenu.mutateAsync({
      name: values.name,
      type: values.type,
      description: values.description,
    })
    reset()
    setModalOpen(false)
    navigate(`/menu/menus/${menu.id}`)
  }

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menus</h1>
          <p className="text-sm text-slate-500">{menus.length} menu{menus.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Menu
        </Button>
      </div>

      {/* Menus grid */}
      {menusQuery.isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">
          Loading menus…
        </div>
      ) : menus.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-slate-400">
            <UtensilsCrossed className="h-8 w-8 opacity-40" />
            <p className="text-sm">No menus yet — create your first menu to get started</p>
            <Button size="sm" onClick={() => setModalOpen(true)}>
              Create Menu
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((menu) => (
            <button
              key={menu.id}
              className="group text-left"
              onClick={() => navigate(`/menu/menus/${menu.id}`)}
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-slate-900">
                        {menu.name}
                      </h3>
                      {menu.description && (
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {menu.description}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="ml-3 mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300 transition-colors group-hover:text-sky-500" />
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Badge variant={menuTypeBadgeVariant(menu.type)}>
                      {menuTypeLabel(menu.type)}
                    </Badge>
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    Updated{' '}
                    {new Date(menu.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Menu">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mname">Menu Name *</Label>
            <Input id="mname" {...register('name')} placeholder="e.g. Lunch Menu" />
            {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mtype">Type</Label>
            <select
              id="mtype"
              {...register('type')}
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="dine_in">Dine In</option>
              <option value="takeout">Takeout</option>
              <option value="delivery">Delivery</option>
              <option value="online">Online</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mdesc">Description</Label>
            <Input id="mdesc" {...register('description')} placeholder="Optional description" />
          </div>

          {createMenu.isError && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Failed to create menu. Please try again.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModalOpen(false)
                reset()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || createMenu.isPending}>
              {createMenu.isPending ? 'Creating…' : 'Create Menu'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
