import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Edit2, MapPin, CheckCircle, XCircle } from 'lucide-react'
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
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
} from '../../hooks/use-settings'
import { useAuthStore } from '../../store/auth.store'

// ─── Schema ───────────────────────────────────────────────────────────────────

const locationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().min(2, 'Country is required').default('US'),
  timezone: z.string().min(1, 'Timezone is required'),
  phone: z.string().optional(),
  email: z.string().email().or(z.literal('')).optional(),
  isActive: z.boolean().default(true),
})

type LocationFormValues = z.infer<typeof locationSchema>

// ─── IANA Timezone options (abbreviated) ──────────────────────────────────────

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
]

// ─── Component ────────────────────────────────────────────────────────────────

export function LocationsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)

  const { user } = useAuthStore()
  const tenantId = user?.tenantId ?? ''

  const { data: locations = [], isLoading } = useLocations(tenantId)
  const createMutation = useCreateLocation()
  const updateMutation = useUpdateLocation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LocationFormValues>({ resolver: zodResolver(locationSchema) })

  const openCreate = () => {
    reset({
      country: 'US',
      timezone: 'America/New_York',
      isActive: true,
    })
    setEditTarget(null)
    setModalOpen(true)
  }

  const openEdit = (loc: any) => {
    setEditTarget(loc)
    reset({
      name: loc.name,
      address: loc.address ?? '',
      city: loc.city,
      state: loc.state,
      postalCode: loc.postalCode,
      country: loc.country ?? 'US',
      timezone: loc.timezone,
      phone: loc.phone ?? '',
      email: loc.email ?? '',
      isActive: loc.isActive ?? true,
    })
    setModalOpen(true)
  }

  const onSubmit = async (values: LocationFormValues) => {
    if (editTarget) {
      await updateMutation.mutateAsync({ id: editTarget.id, ...values })
    } else {
      await createMutation.mutateAsync({ tenantId, ...values })
    }
    setModalOpen(false)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Locations</h1>
          <p className="text-sm text-slate-500">
            {(locations as any[]).length} location{(locations as any[]).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Location
        </Button>
      </div>

      {/* Location Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Loading…</div>
      ) : (locations as any[]).length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          No locations yet
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(locations as any[]).map((loc) => (
            <Card key={loc.id} className="flex flex-col">
              <CardContent className="flex flex-col gap-3 pt-5 pb-4 flex-1">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                      <MapPin className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{loc.name}</p>
                      <div className="flex items-center gap-1 text-xs mt-0.5">
                        {loc.isActive ? (
                          <>
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            <span className="text-green-600">Active</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-500">Inactive</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(loc)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="text-sm text-slate-600 space-y-0.5">
                  <p>{loc.address}</p>
                  <p>
                    {loc.city}, {loc.state} {loc.postalCode}
                  </p>
                  <p>{loc.country}</p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs pt-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {loc.timezone}
                  </span>
                </div>

                {(loc.phone || loc.email) && (
                  <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                    {loc.phone && <p>{loc.phone}</p>}
                    {loc.email && <p>{loc.email}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Location' : 'Add Location'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc-name">Location Name</Label>
              <Input id="loc-name" placeholder="Main Street Store" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc-addr">Address</Label>
              <Input id="loc-addr" placeholder="123 Main St" {...register('address')} />
              {errors.address && (
                <p className="text-xs text-red-500">{errors.address.message}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 col-span-1">
                <Label htmlFor="loc-city">City</Label>
                <Input id="loc-city" {...register('city')} />
                {errors.city && <p className="text-xs text-red-500">{errors.city.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-state">State</Label>
                <Input id="loc-state" {...register('state')} />
                {errors.state && <p className="text-xs text-red-500">{errors.state.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-zip">Postal Code</Label>
                <Input id="loc-zip" {...register('postalCode')} />
                {errors.postalCode && (
                  <p className="text-xs text-red-500">{errors.postalCode.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc-country">Country</Label>
              <Input id="loc-country" {...register('country')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="loc-tz">Timezone</Label>
              <select
                id="loc-tz"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                {...register('timezone')}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              {errors.timezone && (
                <p className="text-xs text-red-500">{errors.timezone.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-phone">Phone</Label>
                <Input id="loc-phone" type="tel" {...register('phone')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="loc-email">Email</Label>
                <Input id="loc-email" type="email" {...register('email')} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="loc-active"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                {...register('isActive')}
              />
              <Label htmlFor="loc-active" className="cursor-pointer">
                Active location
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Saving…'
                  : editTarget
                  ? 'Save Changes'
                  : 'Create Location'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
