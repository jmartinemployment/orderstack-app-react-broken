import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@orderstack/ui'
import {
  useProduct,
  useUpdateProduct,
  useCreateVariant,
  useUpdateVariant,
  type ProductVariant,
  type CreateVariantBody,
} from '../../hooks/use-products'
import { useCategories } from '../../hooks/use-categories'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const detailSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  imageUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  taxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const variantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  sku: z.string().min(1, 'SKU is required').max(100),
  barcode: z.string().optional(),
  price: z.coerce.number().nonnegative('Price must be ≥ 0'),
  cost: z.coerce.number().nonnegative().optional(),
  trackInventory: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

type DetailFormValues = z.infer<typeof detailSchema>
type VariantFormValues = z.infer<typeof variantSchema>

// ─── Inline dialog ────────────────────────────────────────────────────────────

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
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
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

// ─── Variant form (shared for add and edit) ───────────────────────────────────

function VariantForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<VariantFormValues>
  onSubmit: (values: VariantFormValues) => void
  onCancel: () => void
  submitting: boolean
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: { isActive: true, trackInventory: false, ...defaultValues },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vname">Name *</Label>
          <Input id="vname" {...register('name')} placeholder="e.g. Regular" />
          {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vsku">SKU *</Label>
          <Input id="vsku" {...register('sku')} placeholder="e.g. BURG-REG-001" />
          {errors.sku && <p className="text-xs text-red-600">{errors.sku.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vbarcode">Barcode</Label>
        <Input id="vbarcode" {...register('barcode')} placeholder="Optional barcode" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vprice">Price ($) *</Label>
          <Input id="vprice" type="number" step="0.01" min="0" {...register('price')} />
          {errors.price && <p className="text-xs text-red-600">{errors.price.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vcost">Cost ($)</Label>
          <Input id="vcost" type="number" step="0.01" min="0" {...register('cost')} />
        </div>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            {...register('trackInventory')}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Track inventory
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            {...register('isActive')}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Active
        </label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Variant'}
        </Button>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const productQuery = useProduct(id!)
  const categoriesQuery = useCategories()
  const updateProduct = useUpdateProduct()
  const createVariant = useCreateVariant(id!)
  const updateVariant = useUpdateVariant(id!)

  const [addVariantOpen, setAddVariantOpen] = useState(false)
  const [editVariant, setEditVariant] = useState<ProductVariant | null>(null)
  const [savedBanner, setSavedBanner] = useState(false)

  const product = productQuery.data

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
  } = useForm<DetailFormValues>({
    resolver: zodResolver(detailSchema),
    values: product
      ? {
          name: product.name,
          description: product.description ?? '',
          categoryId: product.categoryId ?? '',
          imageUrl: product.imageUrl ?? '',
          taxable: product.taxable,
          isActive: product.isActive,
        }
      : undefined,
  })

  async function onSaveProduct(values: DetailFormValues) {
    if (!id) return
    await updateProduct.mutateAsync({
      id,
      name: values.name,
      description: values.description,
      categoryId: values.categoryId || undefined,
      imageUrl: values.imageUrl || undefined,
      taxable: values.taxable,
      isActive: values.isActive,
    })
    reset(values)
    setSavedBanner(true)
    setTimeout(() => setSavedBanner(false), 3000)
  }

  async function onAddVariant(values: VariantFormValues) {
    const body: CreateVariantBody = {
      name: values.name,
      sku: values.sku,
      barcode: values.barcode,
      price: values.price,
      cost: values.cost,
      trackInventory: values.trackInventory,
      isActive: values.isActive,
    }
    await createVariant.mutateAsync(body)
    setAddVariantOpen(false)
  }

  async function onEditVariant(values: VariantFormValues) {
    if (!editVariant) return
    await updateVariant.mutateAsync({
      id: editVariant.id,
      name: values.name,
      sku: values.sku,
      barcode: values.barcode,
      price: values.price,
      cost: values.cost,
      trackInventory: values.trackInventory,
      isActive: values.isActive,
    })
    setEditVariant(null)
  }

  if (productQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        Loading product…
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
        <p>Product not found</p>
        <Button variant="outline" onClick={() => navigate('/menu/products')}>
          Back to products
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/menu/products')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
          <p className="text-sm text-slate-500">
            {product.productType} &middot; {product.variants.length} variant
            {product.variants.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Badge variant={product.isActive ? 'success' : 'secondary'}>
          {product.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {savedBanner && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4" />
          Product saved successfully
        </div>
      )}

      {/* Product details form */}
      <Card>
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSaveProduct)} className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="categoryId">Category</Label>
                <select
                  id="categoryId"
                  {...register('categoryId')}
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">No category</option>
                  {(categoriesQuery.data ?? []).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Image URL */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  {...register('imageUrl')}
                  placeholder="https://example.com/image.png"
                />
                {errors.imageUrl && (
                  <p className="text-xs text-red-600">{errors.imageUrl.message}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  {...register('description')}
                  rows={3}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-6 md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    {...register('taxable')}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  Taxable
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    {...register('isActive')}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  Active
                </label>
              </div>
            </div>

            {updateProduct.isError && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                Failed to save. Please try again.
              </p>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!isDirty || isSubmitting || updateProduct.isPending}
              >
                {updateProduct.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Variants table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Variants</CardTitle>
            <Button size="sm" onClick={() => setAddVariantOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Variant
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {product.variants.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-slate-400">
              No variants — add one to set pricing and SKU
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
                      SKU
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Price
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Cost
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Inventory
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
                  {product.variants.map((variant) => (
                    <tr key={variant.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium text-slate-900">{variant.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{variant.sku}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(variant.price)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {variant.cost != null
                          ? new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(variant.cost)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {variant.trackInventory ? 'Tracked' : 'Not tracked'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={variant.isActive ? 'success' : 'secondary'}>
                          {variant.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditVariant(variant)}
                          title="Edit variant"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add variant modal */}
      <Modal
        open={addVariantOpen}
        onClose={() => setAddVariantOpen(false)}
        title="Add Variant"
      >
        <VariantForm
          onSubmit={onAddVariant}
          onCancel={() => setAddVariantOpen(false)}
          submitting={createVariant.isPending}
        />
      </Modal>

      {/* Edit variant modal */}
      <Modal
        open={editVariant !== null}
        onClose={() => setEditVariant(null)}
        title="Edit Variant"
      >
        {editVariant && (
          <VariantForm
            defaultValues={{
              name: editVariant.name,
              sku: editVariant.sku,
              barcode: editVariant.barcode ?? '',
              price: editVariant.price,
              cost: editVariant.cost,
              trackInventory: editVariant.trackInventory,
              isActive: editVariant.isActive,
            }}
            onSubmit={onEditVariant}
            onCancel={() => setEditVariant(null)}
            submitting={updateVariant.isPending}
          />
        )}
      </Modal>
    </div>
  )
}
