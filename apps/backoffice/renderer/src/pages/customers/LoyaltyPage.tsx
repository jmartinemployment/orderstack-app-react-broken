import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, Users, Coins, TrendingUp, Layers } from 'lucide-react'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import {
  useLoyaltyPrograms,
  useCreateLoyaltyProgram,
  useUpdateLoyaltyProgram,
} from '../../../hooks/use-customers'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const programSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['points', 'visits', 'spend']),
  earnRate: z.coerce.number().positive('Must be positive'),
  expiryDays: z.coerce.number().int().nonnegative().optional(),
})

type ProgramFormValues = z.infer<typeof programSchema>

const tierSchema = z.object({
  name: z.string().min(1, 'Required'),
  minPoints: z.coerce.number().nonneg(),
  minSpend: z.coerce.number().nonneg(),
  benefits: z.string().optional(),
})

type TierFormValues = z.infer<typeof tierSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-600',
  draft: 'bg-amber-100 text-amber-700',
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-5 w-5 text-slate-600" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-semibold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LoyaltyPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editProgram, setEditProgram] = useState<any | null>(null)
  const [tierProgram, setTierProgram] = useState<any | null>(null)
  const [tierOpen, setTierOpen] = useState(false)
  const [blackoutOpen, setBlackoutOpen] = useState(false)
  const [blackoutItem, setBlackoutItem] = useState('')
  const [blackoutProgramId, setBlackoutProgramId] = useState<string | null>(null)

  const { data: programs = [], isLoading } = useLoyaltyPrograms()
  const createMutation = useCreateLoyaltyProgram()
  const updateMutation = useUpdateLoyaltyProgram()

  // Create/Edit form
  const {
    register: regCreate,
    handleSubmit: submitCreate,
    reset: resetCreate,
    setValue: setCreateValue,
    formState: { errors: createErrors, isSubmitting: creating },
  } = useForm<ProgramFormValues>({ resolver: zodResolver(programSchema) })

  // Tier form
  const {
    register: regTier,
    handleSubmit: submitTier,
    reset: resetTier,
    formState: { errors: tierErrors, isSubmitting: savingTier },
  } = useForm<TierFormValues>({ resolver: zodResolver(tierSchema) })

  const openCreate = () => {
    resetCreate({ type: 'points', earnRate: 1, expiryDays: 365 })
    setEditProgram(null)
    setCreateOpen(true)
  }

  const openEdit = (p: any) => {
    setEditProgram(p)
    resetCreate({
      name: p.name,
      type: p.type,
      earnRate: p.earnRate,
      expiryDays: p.expiryDays ?? 0,
    })
    setCreateOpen(true)
  }

  const onSubmitProgram = async (values: ProgramFormValues) => {
    if (editProgram) {
      await updateMutation.mutateAsync({ id: editProgram.id, ...values })
    } else {
      await createMutation.mutateAsync(values)
    }
    setCreateOpen(false)
  }

  const openTiers = (p: any) => {
    setTierProgram(p)
    resetTier({ minPoints: 0, minSpend: 0 })
    setTierOpen(true)
  }

  const onSubmitTier = async (values: TierFormValues) => {
    const existing = tierProgram?.tiers ?? []
    await updateMutation.mutateAsync({
      id: tierProgram.id,
      tiers: [
        ...existing,
        {
          name: values.name,
          minPoints: values.minPoints,
          minSpend: values.minSpend,
          benefits: values.benefits ? values.benefits.split('\n').filter(Boolean) : [],
        },
      ],
    })
    setTierOpen(false)
  }

  const openBlackout = (p: any) => {
    setBlackoutProgramId(p.id)
    setBlackoutItem('')
    setBlackoutOpen(true)
  }

  const addBlackout = async () => {
    if (!blackoutProgramId || !blackoutItem.trim()) return
    const p = programs.find((x: any) => x.id === blackoutProgramId)
    await updateMutation.mutateAsync({
      id: blackoutProgramId,
      blackoutItems: [...(p?.blackoutItems ?? []), blackoutItem.trim()],
    })
    setBlackoutOpen(false)
  }

  // Aggregate stats
  const totalMembers = programs.reduce((s: number, p: any) => s + (p.totalMembers ?? 0), 0)
  const totalPointsOutstanding = programs.reduce(
    (s: number, p: any) => s + (p.pointsOutstanding ?? 0),
    0,
  )
  const avgEnrollment =
    programs.length > 0
      ? programs.reduce((s: number, p: any) => s + (p.enrollmentRate ?? 0), 0) / programs.length
      : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Loyalty Programs</h1>
          <p className="text-sm text-slate-500">{programs.length} program{programs.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Program
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total Enrolled Members" value={totalMembers.toLocaleString()} />
        <StatCard icon={Coins} label="Points Outstanding" value={totalPointsOutstanding.toLocaleString()} />
        <StatCard icon={TrendingUp} label="Avg Enrollment Rate" value={pct(avgEnrollment)} />
      </div>

      {/* Program Cards */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-12">Loading…</div>
      ) : programs.length === 0 ? (
        <div className="text-center text-slate-400 py-12">No loyalty programs yet</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programs.map((p: any) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLASSES[p.status] ?? STATUS_CLASSES.inactive}`}
                >
                  {p.status}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 flex-1">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Type</p>
                    <p className="font-medium capitalize">{p.type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Earn Rate</p>
                    <p className="font-medium">{p.earnRate} pts</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Members</p>
                    <p className="font-medium">{(p.totalMembers ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Points Out.</p>
                    <p className="font-medium">{(p.pointsOutstanding ?? 0).toLocaleString()}</p>
                  </div>
                </div>

                {/* Tiers */}
                {(p.tiers ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Tiers</p>
                    <div className="flex flex-wrap gap-1">
                      {p.tiers.map((t: any) => (
                        <Badge key={t.name} variant="outline" className="text-xs capitalize">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blackout items */}
                {(p.blackoutItems ?? []).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Blackout Items</p>
                    <div className="flex flex-wrap gap-1">
                      {p.blackoutItems.map((b: string) => (
                        <Badge key={b} variant="secondary" className="text-xs">
                          {b}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-auto pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                    <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openTiers(p)}>
                    <Layers className="mr-1.5 h-3.5 w-3.5" /> Tiers
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openBlackout(p)}>
                    Blackout
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editProgram ? 'Edit Program' : 'New Loyalty Program'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreate(onSubmitProgram)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-name">Program Name</Label>
              <Input id="p-name" {...regCreate('name')} />
              {createErrors.name && (
                <p className="text-xs text-red-500">{createErrors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                defaultValue="points"
                onValueChange={(v) => setCreateValue('type', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="points">Points</SelectItem>
                  <SelectItem value="visits">Visits</SelectItem>
                  <SelectItem value="spend">Spend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-earnRate">Earn Rate (points per $1)</Label>
              <Input id="p-earnRate" type="number" step="0.01" {...regCreate('earnRate')} />
              {createErrors.earnRate && (
                <p className="text-xs text-red-500">{createErrors.earnRate.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-expiry">Point Expiry (days, 0 = never)</Label>
              <Input id="p-expiry" type="number" {...regCreate('expiryDays')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Saving…' : editProgram ? 'Save Changes' : 'Create Program'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tier Modal */}
      <Dialog open={tierOpen} onOpenChange={setTierOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Tier — {tierProgram?.name}</DialogTitle>
          </DialogHeader>

          {/* Existing tiers */}
          {(tierProgram?.tiers ?? []).length > 0 && (
            <div className="flex flex-col gap-2 mb-2">
              <p className="text-sm font-medium text-slate-700">Existing Tiers</p>
              {tierProgram.tiers.map((t: any) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="font-medium capitalize">{t.name}</span>
                  <span className="text-slate-500">
                    {t.minPoints} pts / ${t.minSpend}
                  </span>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submitTier(onSubmitTier)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-name">Tier Name</Label>
              <Input id="t-name" placeholder="e.g. Gold" {...regTier('name')} />
              {tierErrors.name && (
                <p className="text-xs text-red-500">{tierErrors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-pts">Min Points</Label>
                <Input id="t-pts" type="number" {...regTier('minPoints')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-spend">Min Spend ($)</Label>
                <Input id="t-spend" type="number" step="0.01" {...regTier('minSpend')} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t-benefits">Benefits (one per line)</Label>
              <textarea
                id="t-benefits"
                rows={3}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                placeholder="10% discount on all items"
                {...regTier('benefits')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTierOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingTier}>
                {savingTier ? 'Adding…' : 'Add Tier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Blackout Modal */}
      <Dialog open={blackoutOpen} onOpenChange={setBlackoutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Blackout Item</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-500">
              Enter a product name or SKU that cannot earn points.
            </p>
            <Input
              placeholder="Product name or SKU"
              value={blackoutItem}
              onChange={(e) => setBlackoutItem(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlackoutOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addBlackout} disabled={!blackoutItem.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
