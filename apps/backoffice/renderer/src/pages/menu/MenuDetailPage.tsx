import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  Plus,
  Trash2,
  X,
  Globe,
  Pencil,
  Check,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Button, Input, Label, Badge, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { api } from '../../lib/api'
import { useProducts } from '../../hooks/use-products'

// ─── Types ────────────────────────────────────────────────────────────────────

type MenuType = 'dine_in' | 'takeout' | 'delivery' | 'online'

interface MenuItemProduct {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  productType: string
  isActive: boolean
}

interface MenuItem {
  id: string
  menuId: string
  productId: string
  priceOverride: string | null
  isAvailable: boolean
  sortOrder: number
  availableFrom: string | null
  availableUntil: string | null
  availableDays: number[] | null
  product: MenuItemProduct
}

interface MenuLocation {
  menuId: string
  locationId: string
}

interface MenuDetail {
  id: string
  name: string
  description: string | null
  type: MenuType
  items: MenuItem[]
  locations: MenuLocation[]
  createdAt: string
  updatedAt: string
}

interface Location {
  id: string
  name: string
  isActive: string
}

interface LocationsResponse {
  data: Location[]
}

// ─── Inline hooks ─────────────────────────────────────────────────────────────

const menuDetailKeys = {
  detail: (id: string) => ['menus', 'detail', id] as const,
  locations: () => ['locations', 'list'] as const,
}

function useMenu(id: string) {
  return useQuery({
    queryKey: menuDetailKeys.detail(id),
    queryFn: () => api.get<MenuDetail>(`/menus/${id}`),
    enabled: Boolean(id),
  })
}

function useLocations() {
  return useQuery({
    queryKey: menuDetailKeys.locations(),
    queryFn: () => api.get<LocationsResponse>('/locations'),
  })
}

function useUpdateMenu(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; type?: MenuType; description?: string | null }) =>
      api.patch<MenuDetail>(`/menus/${menuId}`, body),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: menuDetailKeys.detail(menuId) }),
  })
}

function useAddMenuItem(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      productId: string
      priceOverride?: number | null
      isAvailable?: boolean
      sortOrder?: number
    }) => api.post<MenuItem>(`/menus/${menuId}/items`, body),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: menuDetailKeys.detail(menuId) }),
  })
}

function useUpdateMenuItem(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      itemId,
      ...body
    }: {
      itemId: string
      isAvailable?: boolean
      priceOverride?: number | null
      availableFrom?: string | null
      availableUntil?: string | null
      availableDays?: number[] | null
    }) => api.patch<MenuItem>(`/menus/${menuId}/items/${itemId}`, body),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: menuDetailKeys.detail(menuId) }),
  })
}

function useRemoveMenuItem(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => api.delete<void>(`/menus/${menuId}/items/${itemId}`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: menuDetailKeys.detail(menuId) }),
  })
}

function usePublishMenu(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (locationIds: string[]) =>
      api.post<{ menuId: string; locationIds: string[] }>(`/menus/${menuId}/publish`, {
        locationIds,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: menuDetailKeys.detail(menuId) }),
  })
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  productId: z.string().min(1, 'Select a product'),
  priceOverride: z.coerce.number().nonnegative().optional().or(z.literal('')),
})

type AddItemFormValues = z.infer<typeof addItemSchema>

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Availability row editor ──────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function AvailabilityEditor({
  item,
  onSave,
  onClose,
  saving,
}: {
  item: MenuItem
  onSave: (data: {
    availableFrom: string | null
    availableUntil: string | null
    availableDays: number[] | null
  }) => void
  onClose: () => void
  saving: boolean
}) {
  const [from, setFrom] = useState(item.availableFrom ?? '')
  const [until, setUntil] = useState(item.availableUntil ?? '')
  const [days, setDays] = useState<number[]>(item.availableDays ?? [0, 1, 2, 3, 4, 5, 6])

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Available From</Label>
          <Input
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Available Until</Label>
          <Input
            type="time"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Available Days</Label>
        <div className="flex flex-wrap gap-2">
          {DAY_NAMES.map((name, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => toggleDay(idx)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                days.includes(idx)
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave({
              availableFrom: from || null,
              availableUntil: until || null,
              availableDays: days.length < 7 ? days : null,
            })
          }
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MenuDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const menuQuery = useMenu(id!)
  const locationsQuery = useLocations()
  const productsQuery = useProducts({ limit: 200 })

  const updateMenu = useUpdateMenu(id!)
  const addItem = useAddMenuItem(id!)
  const updateItem = useUpdateMenuItem(id!)
  const removeItem = useRemoveMenuItem(id!)
  const publishMenu = usePublishMenu(id!)

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [availabilityItem, setAvailabilityItem] = useState<MenuItem | null>(null)
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])

  const menu = menuQuery.data
  const items = menu?.items ?? []
  const existingProductIds = useMemo(() => new Set(items.map((i) => i.productId)), [items])
  const assignedLocationIds = useMemo(
    () => new Set(menu?.locations.map((l) => l.locationId) ?? []),
    [menu],
  )
  const availableProducts = (productsQuery.data?.data ?? []).filter(
    (p) => p.isActive && !existingProductIds.has(p.id),
  )
  const allLocations = locationsQuery.data?.data ?? []

  // Pre-select currently assigned locations when opening publish dialog
  function openPublish() {
    setSelectedLocations([...assignedLocationIds])
    setPublishOpen(true)
  }

  function toggleLocation(locId: string) {
    setSelectedLocations((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId],
    )
  }

  async function handlePublish() {
    if (selectedLocations.length === 0) return
    await publishMenu.mutateAsync(selectedLocations)
    setPublishOpen(false)
  }

  // Add item form
  const {
    register,
    handleSubmit,
    reset: resetAddForm,
    formState: { errors },
  } = useForm<AddItemFormValues>({ resolver: zodResolver(addItemSchema) })

  async function onAddItem(values: AddItemFormValues) {
    await addItem.mutateAsync({
      productId: values.productId,
      priceOverride:
        values.priceOverride === '' || values.priceOverride === undefined
          ? null
          : Number(values.priceOverride),
      isAvailable: true,
    })
    resetAddForm()
    setAddItemOpen(false)
  }

  async function handleToggleAvailability(item: MenuItem) {
    await updateItem.mutateAsync({ itemId: item.id, isAvailable: !item.isAvailable })
  }

  async function handleSaveAvailability(
    item: MenuItem,
    data: {
      availableFrom: string | null
      availableUntil: string | null
      availableDays: number[] | null
    },
  ) {
    await updateItem.mutateAsync({ itemId: item.id, ...data })
    setAvailabilityItem(null)
  }

  async function handleSaveName() {
    if (!nameValue.trim() || !id) return
    await updateMenu.mutateAsync({ name: nameValue.trim() })
    setEditingName(false)
  }

  if (menuQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">Loading menu…</div>
    )
  }

  if (!menu) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
        <p>Menu not found</p>
        <Button variant="outline" onClick={() => navigate('/menu/menus')}>
          Back to menus
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/menu/menus')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex flex-1 items-center gap-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="text-2xl font-bold h-auto py-0.5"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                className="text-green-600 hover:bg-green-50"
                onClick={handleSaveName}
                disabled={updateMenu.isPending}
              >
                <Check className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditingName(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{menu.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setNameValue(menu.name)
                  setEditingName(true)
                }}
                title="Edit name"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Badge variant="secondary" className="capitalize">
            {menu.type.replace('_', ' ')}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {assignedLocationIds.size} location{assignedLocationIds.size !== 1 ? 's' : ''}
          </span>
          <Button variant="outline" onClick={openPublish} className="gap-2">
            <Globe className="h-4 w-4" />
            Publish
          </Button>
          <Button onClick={() => setAddItemOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Items table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Menu Items ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-400">
              No items yet — add products to this menu
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Product
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Menu Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Availability
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Days / Time
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item) => {
                    const hasDays = item.availableDays && item.availableDays.length < 7
                    const hasTime = item.availableFrom || item.availableUntil
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-slate-900">{item.product.name}</p>
                            <p className="text-xs text-slate-400 capitalize">
                              {item.product.productType}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-900">
                          {item.priceOverride
                            ? new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              }).format(Number(item.priceOverride))
                            : <span className="text-slate-400 font-normal">Default</span>}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => handleToggleAvailability(item)}
                            disabled={updateItem.isPending}
                            className="flex items-center gap-1.5 text-sm"
                          >
                            {item.isAvailable ? (
                              <>
                                <ToggleRight className="h-5 w-5 text-green-500" />
                                <span className="text-green-600">Available</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-5 w-5 text-slate-400" />
                                <span className="text-slate-400">Hidden</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          <button
                            className="flex flex-col gap-0.5 text-left hover:text-sky-600 transition-colors"
                            onClick={() => setAvailabilityItem(item)}
                            title="Edit availability schedule"
                          >
                            {hasDays ? (
                              <span className="text-xs">
                                {item.availableDays!.map((d) => DAY_NAMES[d]).join(', ')}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">All days</span>
                            )}
                            {hasTime ? (
                              <span className="text-xs">
                                {item.availableFrom ?? '—'} – {item.availableUntil ?? '—'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">All hours</span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={() => removeItem.mutate(item.id)}
                              title="Remove from menu"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add item modal */}
      <Modal open={addItemOpen} onClose={() => setAddItemOpen(false)} title="Add Item to Menu">
        <form onSubmit={handleSubmit(onAddItem)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="productId">Product *</Label>
            <select
              id="productId"
              {...register('productId')}
              className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">Select a product…</option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="text-xs text-red-600">{errors.productId.message}</p>
            )}
            {availableProducts.length === 0 && (
              <p className="text-xs text-slate-400">
                All active products are already on this menu.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priceOverride">Price Override ($)</Label>
            <Input
              id="priceOverride"
              type="number"
              step="0.01"
              min="0"
              {...register('priceOverride')}
              placeholder="Leave blank to use default price"
            />
          </div>

          {addItem.isError && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Failed to add item. Please try again.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddItemOpen(false)
                resetAddForm()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addItem.isPending || availableProducts.length === 0}>
              {addItem.isPending ? 'Adding…' : 'Add to Menu'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Availability editor modal */}
      <Modal
        open={availabilityItem !== null}
        onClose={() => setAvailabilityItem(null)}
        title={`Availability: ${availabilityItem?.product.name}`}
      >
        {availabilityItem && (
          <AvailabilityEditor
            item={availabilityItem}
            onSave={(data) => handleSaveAvailability(availabilityItem, data)}
            onClose={() => setAvailabilityItem(null)}
            saving={updateItem.isPending}
          />
        )}
      </Modal>

      {/* Publish menu modal */}
      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publish Menu">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Select which locations this menu should be available at. Removing a location will
            unassign the menu from that location.
          </p>

          {allLocations.length === 0 ? (
            <p className="text-sm text-slate-400">No locations found.</p>
          ) : (
            <div className="space-y-2">
              {allLocations.map((loc) => (
                <label
                  key={loc.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedLocations.includes(loc.id)}
                    onChange={() => toggleLocation(loc.id)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{loc.name}</p>
                    <p className="text-xs text-slate-400">
                      {loc.isActive === 'true' ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {publishMenu.isError && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Publish failed. Please try again.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={selectedLocations.length === 0 || publishMenu.isPending}
            >
              {publishMenu.isPending ? 'Publishing…' : 'Publish Menu'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
