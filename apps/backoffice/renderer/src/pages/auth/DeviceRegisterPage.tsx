import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router'
import {
  Button,
  Input,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@orderstack/ui'
import { Monitor, ShieldCheck } from 'lucide-react'
import { useDeviceStore } from '../../store/device.store'
import { useAuthStore } from '../../store/auth.store'

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  deviceName: z
    .string()
    .min(2, 'Device name must be at least 2 characters')
    .max(64, 'Device name must be 64 characters or fewer'),
  locationId: z.string().min(1, 'Please select a location'),
})

type RegisterFormValues = z.infer<typeof registerSchema>

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  id: string
  name: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeviceRegisterPage() {
  const navigate = useNavigate()
  const { completeRegistration } = useDeviceStore()
  const { accessToken } = useAuthStore()

  const [deviceInfo, setDeviceInfo] = useState<{
    id: string | null
    platform: string
    hostname: string
    hasCertificate: boolean
    fingerprint: string
  } | null>(null)

  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLocations, setLoadingLocations] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { deviceName: '', locationId: '' },
  })

  // Load device info
  useEffect(() => {
    window.electron.device.getInfo().then((info) => {
      setDeviceInfo(info)
      setValue('deviceName', info.hostname)
    })
  }, [setValue])

  // Load locations from API (requires auth)
  useEffect(() => {
    if (!accessToken) return

    setLoadingLocations(true)
    fetch(`${import.meta.env.VITE_API_URL}/v1/locations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) return
        const data = (await res.json()) as { data: Location[] }
        setLocations(data.data ?? [])
      })
      .catch(() => {
        // Non-critical — user can still proceed if API is unavailable temporarily
      })
      .finally(() => setLoadingLocations(false))
  }, [accessToken])

  const onSubmit = async (values: RegisterFormValues) => {
    if (!deviceInfo) return
    setServerError(null)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/devices/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          name: values.deviceName,
          locationId: values.locationId,
          fingerprint: deviceInfo.fingerprint,
          platform: deviceInfo.platform,
          hostname: deviceInfo.hostname,
        }),
      })

      const data = (await res.json()) as { deviceId?: string; certificate?: string; message?: string }

      if (!res.ok) {
        setServerError(data.message ?? 'Registration failed. Please try again.')
        return
      }

      if (!data.deviceId || !data.certificate) {
        setServerError('Invalid response from server. Please contact support.')
        return
      }

      await completeRegistration(data.deviceId, data.certificate)
      navigate('/dashboard', { replace: true })
    } catch {
      setServerError('Unable to connect to the server. Check your network and try again.')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-50 text-sky-600 shrink-0">
              <ShieldCheck size={20} />
            </div>
            <CardTitle className="text-base">Register this device</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Before you can use OrderStack on this machine, it must be registered with your
            account. This links the device to a location and issues a secure certificate for
            encrypted communication.
          </p>

          {/* Device info panel */}
          {deviceInfo && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 flex items-start gap-3">
              <Monitor size={16} className="text-slate-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-slate-700">Detected device</p>
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-600">{deviceInfo.hostname}</span>
                  {' '}· {deviceInfo.platform}
                </p>
                <p className="text-xs text-slate-400 font-mono break-all">
                  {deviceInfo.fingerprint.slice(0, 48)}…
                </p>
              </div>
            </div>
          )}

          {/* Server error */}
          {serverError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Device name */}
            <div className="space-y-1.5">
              <Label htmlFor="deviceName">Device name</Label>
              <Input
                id="deviceName"
                placeholder="e.g. Register 1 — Front Counter"
                aria-invalid={!!errors.deviceName}
                {...register('deviceName')}
              />
              {errors.deviceName ? (
                <p className="text-xs text-red-600">{errors.deviceName.message}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  A friendly name to identify this terminal in reports and device management.
                </p>
              )}
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <Label htmlFor="locationId">Location</Label>
              {loadingLocations ? (
                <div className="h-9 rounded-md border border-input bg-slate-50 animate-pulse" />
              ) : (
                <select
                  id="locationId"
                  aria-invalid={!!errors.locationId}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  {...register('locationId')}
                >
                  <option value="">Select a location…</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.locationId && (
                <p className="text-xs text-red-600">{errors.locationId.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !deviceInfo || loadingLocations}
            >
              {isSubmitting ? 'Registering device…' : 'Register device'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
