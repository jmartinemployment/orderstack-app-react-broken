import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown } from 'lucide-react'
import { Button, Input, Label, Badge, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type Category,
} from '../../hooks/use-categories'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  parentId: z.string().optional(),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
})

type CategoryFormValues = z.infer<typeof categorySchema>

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flatten tree into depth-annotated list preserving sort order */
function flattenTree(
  categories: Category[],
  parentId: string | null = null,
  depth = 0,
): Array<Category & { depth: number }> {
  return categories
    .filter((c) => (parentId === null ? !c.parentId : c.parentId === parentId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((c) => [
      { ...c, depth },
      ...flattenTree(categories, c.id, depth + 1),
    ])
}

// ─── Inline edit row ──────────────────────────────────────────────────────────

function InlineEdit({
  initialName,
  onSave,
  onCancel,
  saving,
}: {
  initialName: string
  onSave: (name: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [value, setValue] = useState(initialName)

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(value)
          if (e.key === 'Escape') onCancel()
        }}
        className="h-7 text-sm"
        autoFocus
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-green-600 hover:bg-green-50"
        onClick={() => onSave(value)}
        disabled={saving}
        title="Save"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-slate-400 hover:bg-slate-50"
        onClick={onCancel}
        title="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CategoriesPage() {
  const categoriesQuery = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const categories = categoriesQuery.data ?? []
  const flat = flattenTree(categories)

  // Create form
  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { sortOrder: 0 },
  })

  async function onCreateSubmit(values: CategoryFormValues) {
    await createCategory.mutateAsync({
      name: values.name,
      parentId: values.parentId || undefined,
      sortOrder: values.sortOrder,
    })
    resetForm()
    setAddOpen(false)
  }

  async function handleInlineSave(id: string, name: string) {
    if (!name.trim()) return
    await updateCategory.mutateAsync({ id, name: name.trim() })
    setEditingId(null)
  }

  async function handleDelete() {
    if (!deleteId) return
    await deleteCategory.mutateAsync(deleteId)
    setDeleteId(null)
  }

  async function handleMoveUp(cat: Category & { depth: number }) {
    // Find siblings
    const siblings = flat.filter((c) => c.depth === cat.depth && c.parentId === cat.parentId)
    const idx = siblings.findIndex((c) => c.id === cat.id)
    if (idx <= 0) return
    const prev = siblings[idx - 1]!
    await Promise.all([
      updateCategory.mutateAsync({ id: cat.id, sortOrder: prev.sortOrder }),
      updateCategory.mutateAsync({ id: prev.id, sortOrder: cat.sortOrder }),
    ])
  }

  async function handleMoveDown(cat: Category & { depth: number }) {
    const siblings = flat.filter((c) => c.depth === cat.depth && c.parentId === cat.parentId)
    const idx = siblings.findIndex((c) => c.id === cat.id)
    if (idx >= siblings.length - 1) return
    const next = siblings[idx + 1]!
    await Promise.all([
      updateCategory.mutateAsync({ id: cat.id, sortOrder: next.sortOrder }),
      updateCategory.mutateAsync({ id: next.id, sortOrder: cat.sortOrder }),
    ])
  }

  const deleteTarget = categories.find((c) => c.id === deleteId)
  const hasProducts = false // would need a product count endpoint; safe default

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">{categories.length} categories</p>
        </div>
        <Button onClick={() => setAddOpen((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Add category form */}
      {addOpen && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cname">Name *</Label>
                  <Input id="cname" {...register('name')} placeholder="Category name" />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="parentId">Parent</Label>
                  <select
                    id="parentId"
                    {...register('parentId')}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">No parent (top level)</option>
                    {flat.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {'—'.repeat(cat.depth)} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sortOrder">Sort Order</Label>
                  <Input
                    id="sortOrder"
                    type="number"
                    min="0"
                    {...register('sortOrder')}
                    placeholder="0"
                  />
                </div>
              </div>

              {createCategory.isError && (
                <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  Failed to create category.
                </p>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddOpen(false)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting || createCategory.isPending}>
                  {createCategory.isPending ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Categories tree */}
      <Card>
        {categoriesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            Loading categories…
          </div>
        ) : flat.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            No categories yet — add one to get started
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Sort
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {flat.map((cat) => {
                  const siblings = flat.filter(
                    (c) => c.depth === cat.depth && c.parentId === cat.parentId,
                  )
                  const idx = siblings.findIndex((c) => c.id === cat.id)
                  const isFirst = idx === 0
                  const isLast = idx === siblings.length - 1

                  return (
                    <tr key={cat.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <div
                          className="flex items-center"
                          style={{ paddingLeft: cat.depth * 20 }}
                        >
                          {cat.depth > 0 && (
                            <span className="mr-2 text-slate-300">└</span>
                          )}
                          {editingId === cat.id ? (
                            <InlineEdit
                              initialName={cat.name}
                              onSave={(name) => handleInlineSave(cat.id, name)}
                              onCancel={() => setEditingId(null)}
                              saving={updateCategory.isPending}
                            />
                          ) : (
                            <span className="font-medium text-slate-900">{cat.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{cat.sortOrder}</td>
                      <td className="px-4 py-3">
                        <Badge variant={cat.isActive ? 'success' : 'secondary'}>
                          {cat.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Move up/down */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMoveUp(cat)}
                            disabled={isFirst || updateCategory.isPending}
                            className="h-7 w-7"
                            title="Move up"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMoveDown(cat)}
                            disabled={isLast || updateCategory.isPending}
                            className="h-7 w-7"
                            title="Move down"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>

                          {/* Edit */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setEditingId(editingId === cat.id ? null : cat.id)
                            }
                            className="h-7 w-7"
                            title="Edit name"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(cat.id)}
                            className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      </Card>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Category"
        description={
          hasProducts
            ? `"${deleteTarget?.name}" has products assigned. Deleting it may leave products uncategorized. Continue?`
            : `Delete "${deleteTarget?.name}"? This cannot be undone.`
        }
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleteCategory.isPending}
      />
    </div>
  )
}
