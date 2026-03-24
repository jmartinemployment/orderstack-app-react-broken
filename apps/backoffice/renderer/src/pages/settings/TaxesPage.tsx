import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
} from '@orderstack/ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import { api } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaxClass {
  id: string
  name: string
  rate: number
  appliesTo: string
  isCompound: boolean
  isActive: boolean
  createdAt: string
}

// ─── Inline Hooks ─────────────────────────────────────────────────────────────

const taxKeys = {
  all: ['taxes'] as const,
  list: () => [...taxKeys.all, 'list'] as const,
}

function useTaxClasses() {
  return useQuery({
    queryKey: taxKeys.list(),
    queryFn: () => api.get<TaxClass[]>('/taxes'),
  })
}

function useCreateTaxClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Omit<TaxClass, 'id' | 'createdAt'>) =>
      api.post<TaxClass>('/taxes', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: taxKeys.list() }),
  })
}

function useUpdateTaxClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<TaxClass> & { id: string }) =>
      api.patch<TaxClass>(`/taxes/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: taxKeys.list() }),
  })
}

function useDeleteTaxClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/taxes/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: taxKeys.list() }),
  })
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const taxSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  rate: z.coerce
    .number()
    .min(0, 'Rate must be non-negative')
    .max(100, 'Rate cannot exceed 100'),
  appliesTo: z.string().min(1, 'Applies To is required'),
  isCompound: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

type TaxFormValues = z.infer<typeof taxSchema>

// ─── Component ────────────────────────────────────────────────────────────────

export function TaxesPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TaxClass | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TaxClass | null>(null)

  const { data: taxes = [], isLoading } = useTaxClasses()
  const createMutation = useCreateTaxClass()
  const updateMutation = useUpdateTaxClass()
  const deleteMutation = useDeleteTaxClass()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaxFormValues>({ resolver: zodResolver(taxSchema) })

  const openCreate = () => {
    reset({ isCompound: false, isActive: true, appliesTo: 'all' })
    setEditTarget(null)
    setModalOpen(true)
  }

  const openEdit = (tax: TaxClass) => {
    setEditTarget(tax)
    reset({
      name: tax.name,
      rate: tax.rate,
      appliesTo: tax.appliesTo,
      isCompound: tax.isCompound,
      isActive: tax.isActive,
    })
    setModalOpen(true)
  }

  const onSubmit = async (values: TaxFormValues) => {
    if (editTarget) {
      await updateMutation.mutateAsync({ id: editTarget.id, ...values })
    } else {
      await createMutation.mutateAsync(values as Omit<TaxClass, 'id' | 'createdAt'>)
    }
    setModalOpen(false)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await deleteMutation.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tax Classes</h1>
          <p className="text-sm text-slate-500">
            {taxes.length} tax class{taxes.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Tax Class
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Applies To</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Compound</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : taxes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No tax classes yet
                    </td>
                  </tr>
                ) : (
                  taxes.map((tax) => (
                    <tr key={tax.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{tax.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {tax.rate.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">{tax.appliesTo}</td>
                      <td className="px-4 py-3">
                        {tax.isCompound ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                            Compound
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tax.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-xs font-medium">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(tax)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteTarget(tax)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Tax Class' : 'New Tax Class'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-name">Name</Label>
              <Input id="tax-name" placeholder="e.g. Sales Tax" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-rate">Rate (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                step="0.001"
                min="0"
                max="100"
                placeholder="8.5"
                {...register('rate')}
              />
              {errors.rate && <p className="text-xs text-red-500">{errors.rate.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-applies">Applies To</Label>
              <Input
                id="tax-applies"
                placeholder="all, food, alcohol, etc."
                {...register('appliesTo')}
              />
              {errors.appliesTo && (
                <p className="text-xs text-red-500">{errors.appliesTo.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="tax-compound"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                {...register('isCompound')}
              />
              <Label htmlFor="tax-compound" className="cursor-pointer">
                Compound tax (applied on top of other taxes)
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="tax-active"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                {...register('isActive')}
              />
              <Label htmlFor="tax-active" className="cursor-pointer">
                Active
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : editTarget ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Tax Class</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Delete <span className="font-medium">"{deleteTarget?.name}"</span>? Products using this
            tax class will no longer have it applied.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
