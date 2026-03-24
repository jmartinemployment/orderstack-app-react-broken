import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { Button, Input, Label, Badge, Card, CardContent } from '@orderstack/ui'
import { api } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Modifier {
  id: string
  modifierGroupId: string
  name: string
  priceDelta: string
  costDelta: string
  sku: string | null
  isActive: boolean
  sortOrder: number
}

interface ModifierGroup {
  id: string
  name: string
  selectionType: 'single' | 'multiple'
  minSelections: number
  maxSelections: number | null
  isRequired: boolean
  modifiers: Modifier[]
}

interface ModifierGroupsResponse {
  data: ModifierGroup[]
}

// ─── Inline hooks ─────────────────────────────────────────────────────────────

const modifierGroupKeys = {
  all: ['modifier-groups'] as const,
  list: () => [...modifierGroupKeys.all, 'list'] as const,
}

function useModifierGroups() {
  return useQuery({
    queryKey: modifierGroupKeys.list(),
    queryFn: () => api.get<ModifierGroupsResponse>('/modifier-groups'),
  })
}

function useCreateModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: unknown) => api.post<ModifierGroup>('/modifier-groups', body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: modifierGroupKeys.list() }),
  })
}

function useUpdateModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<ModifierGroup>(`/modifier-groups/${id}`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: modifierGroupKeys.list() }),
  })
}

function useDeleteModifierGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/modifier-groups/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: modifierGroupKeys.list() }),
  })
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const modifierLineSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name required'),
  priceDelta: z.coerce.number().default(0),
})

const groupSchema = z.object({
  name: z.string().min(1, 'Group name required').max(255),
  selectionType: z.enum(['single', 'multiple']),
  minSelections: z.coerce.number().int().nonnegative().default(0),
  maxSelections: z.coerce.number().int().positive().nullable().optional(),
  isRequired: z.boolean().default(false),
  modifiers: z.array(modifierLineSchema).default([]),
})

type GroupFormValues = z.infer<typeof groupSchema>

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
      <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl">
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

// ─── Group form (shared create / edit) ───────────────────────────────────────

function GroupForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  defaultValues?: Partial<GroupFormValues>
  onSubmit: (values: GroupFormValues) => void
  onCancel: () => void
  submitting: boolean
  error?: boolean
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      selectionType: 'single',
      minSelections: 0,
      isRequired: false,
      modifiers: [],
      ...defaultValues,
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'modifiers' })
  const selectionType = watch('selectionType')

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Group name */}
      <div className="space-y-1.5">
        <Label htmlFor="gname">Group Name *</Label>
        <Input id="gname" {...register('name')} placeholder="e.g. Sauce options" />
        {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
      </div>

      {/* Selection type + min/max */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="selectionType">Type</Label>
          <select
            id="selectionType"
            {...register('selectionType')}
            className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="single">Single</option>
            <option value="multiple">Multiple</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minSelections">Min</Label>
          <Input
            id="minSelections"
            type="number"
            min="0"
            {...register('minSelections')}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="maxSelections">
            Max {selectionType === 'single' ? '(single = 1)' : ''}
          </Label>
          <Input
            id="maxSelections"
            type="number"
            min="1"
            {...register('maxSelections', {
              setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
            })}
            placeholder="No limit"
            disabled={selectionType === 'single'}
          />
        </div>
      </div>

      {/* Required toggle */}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          {...register('isRequired')}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
        />
        Required selection
      </label>

      {/* Modifiers list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Modifiers</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: '', priceDelta: 0 })}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Option
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-slate-400">No modifiers yet — add at least one option.</p>
        ) : (
          <div className="space-y-2">
            {fields.map((field, idx) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    {...register(`modifiers.${idx}.name`)}
                    placeholder="Option name"
                    className="h-8 text-sm"
                  />
                  {errors.modifiers?.[idx]?.name && (
                    <p className="text-xs text-red-600">
                      {errors.modifiers[idx]?.name?.message}
                    </p>
                  )}
                </div>
                <div className="w-28">
                  <Input
                    {...register(`modifiers.${idx}.priceDelta`)}
                    type="number"
                    step="0.01"
                    placeholder="+$0.00"
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 h-8 w-8 text-slate-400 hover:text-red-500"
                  onClick={() => remove(idx)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Failed to save. Please try again.
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Group'}
        </Button>
      </div>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ModifierGroupsPage() {
  const groupsQuery = useModifierGroups()
  const createGroup = useCreateModifierGroup()
  const updateGroup = useUpdateModifierGroup()
  const deleteGroup = useDeleteModifierGroup()

  const [createOpen, setCreateOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<ModifierGroup | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const groups = groupsQuery.data?.data ?? []
  const deleteTarget = groups.find((g) => g.id === deleteId)

  async function handleCreate(values: GroupFormValues) {
    await createGroup.mutateAsync({
      name: values.name,
      selectionType: values.selectionType,
      minSelections: values.minSelections,
      maxSelections: values.maxSelections ?? null,
      isRequired: values.isRequired,
      modifiers: values.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        priceDelta: m.priceDelta,
      })),
    })
    setCreateOpen(false)
  }

  async function handleEdit(values: GroupFormValues) {
    if (!editGroup) return
    await updateGroup.mutateAsync({
      id: editGroup.id,
      name: values.name,
      selectionType: values.selectionType,
      minSelections: values.minSelections,
      maxSelections: values.maxSelections ?? null,
      isRequired: values.isRequired,
      modifiers: values.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        priceDelta: m.priceDelta,
      })),
    })
    setEditGroup(null)
  }

  async function handleDelete() {
    if (!deleteId) return
    await deleteGroup.mutateAsync(deleteId)
    setDeleteId(null)
  }

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Modifier Groups</h1>
          <p className="text-sm text-slate-500">{groups.length} groups</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Group
        </Button>
      </div>

      {/* Groups table */}
      <Card>
        {groupsQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            Loading modifier groups…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            No modifier groups yet
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
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Min / Max
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Required
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Options
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {groups.map((group) => (
                  <tr key={group.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{group.name}</td>
                    <td className="px-4 py-4">
                      <Badge variant="secondary" className="capitalize">
                        {group.selectionType}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {group.minSelections}
                      {' / '}
                      {group.maxSelections ?? '∞'}
                    </td>
                    <td className="px-4 py-4">
                      {group.isRequired ? (
                        <Badge variant="warning">Required</Badge>
                      ) : (
                        <span className="text-slate-400">Optional</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {group.modifiers.length} option
                      {group.modifiers.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditGroup(group)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setDeleteId(group.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Modifier Group">
        <GroupForm
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
          submitting={createGroup.isPending}
          error={createGroup.isError}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editGroup !== null}
        onClose={() => setEditGroup(null)}
        title={`Edit: ${editGroup?.name}`}
      >
        {editGroup && (
          <GroupForm
            defaultValues={{
              name: editGroup.name,
              selectionType: editGroup.selectionType,
              minSelections: editGroup.minSelections,
              maxSelections: editGroup.maxSelections,
              isRequired: editGroup.isRequired,
              modifiers: editGroup.modifiers.map((m) => ({
                id: m.id,
                name: m.name,
                priceDelta: Number(m.priceDelta),
              })),
            }}
            onSubmit={handleEdit}
            onCancel={() => setEditGroup(null)}
            submitting={updateGroup.isPending}
            error={updateGroup.isError}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Modifier Group"
        description={`Delete "${deleteTarget?.name}"? If this group is assigned to products, the delete will be rejected by the server.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        loading={deleteGroup.isPending}
      />
    </div>
  )
}
