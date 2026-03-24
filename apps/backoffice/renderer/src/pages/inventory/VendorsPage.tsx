import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
} from '@orderstack/ui'
import {
  useVendors,
  useCreateVendor,
  useUpdateVendor,
  type Vendor,
  type CreateVendorBody,
  type UpdateVendorBody,
} from '../../hooks/use-inventory'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { vendorKeys } from '../../hooks/use-inventory'

// ---------------------------------------------------------------------------
// Delete (soft) vendor — inline mutation
// ---------------------------------------------------------------------------

function useDeleteVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/vendors/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: vendorKeys.lists() })
    },
  })
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const vendorSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactName: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

type VendorForm = z.infer<typeof vendorSchema>

// ---------------------------------------------------------------------------
// Create / Edit modal
// ---------------------------------------------------------------------------

function VendorModal({
  vendor,
  onClose,
}: {
  vendor?: Vendor
  onClose: () => void
}) {
  const createVendor = useCreateVendor()
  const updateVendor = useUpdateVendor()
  const isEditing = Boolean(vendor)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VendorForm>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: vendor?.name ?? '',
      contactName: vendor?.contactName ?? '',
      email: vendor?.email ?? '',
      phone: vendor?.phone ?? '',
      address: vendor?.address ?? '',
      notes: vendor?.notes ?? '',
    },
  })

  const onSubmit = (data: VendorForm) => {
    const body: CreateVendorBody = {
      name: data.name,
      contactName: data.contactName || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      address: data.address || undefined,
      notes: data.notes || undefined,
    }

    if (isEditing && vendor) {
      const updateBody: UpdateVendorBody = { id: vendor.id, ...body }
      updateVendor.mutate(updateBody, { onSuccess: onClose })
    } else {
      createVendor.mutate(body, { onSuccess: onClose })
    }
  }

  const isPending = createVendor.isPending || updateVendor.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isEditing ? 'Edit Vendor' : 'New Vendor'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="v-name">Vendor Name</Label>
                <Input id="v-name" placeholder="Acme Supplies Co." {...register('name')} />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-contact">Contact Name</Label>
                <Input id="v-contact" placeholder="John Smith" {...register('contactName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-email">Email</Label>
                <Input id="v-email" type="email" placeholder="contact@vendor.com" {...register('email')} />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-phone">Phone</Label>
                <Input id="v-phone" type="tel" placeholder="+1 555 000 0000" {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-address">Address</Label>
                <Input id="v-address" placeholder="123 Main St, City, ST" {...register('address')} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="v-notes">Notes</Label>
                <textarea
                  id="v-notes"
                  rows={3}
                  placeholder="Payment terms, delivery notes…"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  {...register('notes')}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Vendor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  vendor,
  onClose,
}: {
  vendor: Vendor
  onClose: () => void
}) {
  const deleteVendor = useDeleteVendor()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-red-500 mt-0.5 shrink-0" size={20} />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Delete Vendor</h2>
            <p className="text-sm text-slate-500 mt-1">
              Are you sure you want to deactivate{' '}
              <span className="font-medium text-slate-900">{vendor.name}</span>? This action soft-deletes the
              vendor and cannot be easily reversed.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteVendor.isPending}
            onClick={() => deleteVendor.mutate(vendor.id, { onSuccess: onClose })}
          >
            {deleteVendor.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function VendorsPage() {
  const [search, setSearch] = useState('')
  const [modalVendor, setModalVendor] = useState<Vendor | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)

  const { data, isLoading, isError } = useVendors({ search: search || undefined })
  const vendors = data?.data ?? []

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-72">
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3"
          />
        </div>
        <Button onClick={() => setModalVendor('new')}>
          <Plus size={15} className="mr-1.5" />
          New Vendor
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-0 px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Name', 'Contact', 'Email', 'Phone', 'Status', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Loading vendors…
                    </td>
                  </tr>
                )}
                {isError && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-red-500 text-sm">
                      Failed to load vendors.
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && vendors.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                      No vendors found.
                    </td>
                  </tr>
                )}
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{vendor.name}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{vendor.contactName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {vendor.email ? (
                        <a href={`mailto:${vendor.email}`} className="text-sky-600 hover:underline">
                          {vendor.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{vendor.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      {vendor.isActive ? (
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-700 border-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 border-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={() => setModalVendor(vendor)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-red-500"
                          onClick={() => setDeleteTarget(vendor)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {(modalVendor === 'new' || (modalVendor && modalVendor !== 'new')) && (
        <VendorModal
          vendor={modalVendor !== 'new' ? modalVendor : undefined}
          onClose={() => setModalVendor(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog vendor={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
