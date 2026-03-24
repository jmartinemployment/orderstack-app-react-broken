import { useState } from 'react'
import { Monitor, Smartphone, AlertTriangle } from 'lucide-react'
import {
  Button,
  Badge,
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
import { useDevices, useRevokeDevice } from '../../hooks/use-devices'
import { useDeviceStore } from '../../store/device.store'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return 'Never'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString()
}

const STATUS_CLASSES = {
  online: 'bg-green-100 text-green-700',
  offline: 'bg-slate-100 text-slate-600',
  revoked: 'bg-red-100 text-red-700',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DevicesPage() {
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null)

  const { data: devices = [], isLoading } = useDevices()
  const revokeMutation = useRevokeDevice()

  // Identify the current device
  const { deviceInfo } = useDeviceStore()
  const currentDeviceId = deviceInfo?.id ?? null

  const confirmRevoke = async () => {
    if (!revokeTarget) return
    await revokeMutation.mutateAsync(revokeTarget.id)
    setRevokeTarget(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Registered Devices</h1>
        <p className="text-sm text-slate-500">
          {(devices as any[]).length} device{(devices as any[]).length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Platform</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Hostname</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Last Seen</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Registered By</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : (devices as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                      No devices registered
                    </td>
                  </tr>
                ) : (
                  (devices as any[]).map((device) => {
                    const isCurrent = device.id === currentDeviceId
                    const statusCls =
                      STATUS_CLASSES[device.status as keyof typeof STATUS_CLASSES] ??
                      STATUS_CLASSES.offline
                    return (
                      <tr
                        key={device.id}
                        className={`border-b border-slate-100 ${
                          isCurrent ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {device.platform === 'ios' || device.platform === 'android' ? (
                              <Smartphone className="h-4 w-4 text-slate-400" />
                            ) : (
                              <Monitor className="h-4 w-4 text-slate-400" />
                            )}
                            <span className="font-medium text-slate-900">{device.name}</span>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-xs">
                                This device
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600">
                          {device.platform}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">{device.hostname}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {device.locationName ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusCls}`}
                          >
                            {device.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(device.lastSeenAt)}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {device.registeredByName ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={device.status === 'revoked' || isCurrent}
                            onClick={() => setRevokeTarget(device)}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Revoke Confirmation */}
      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(v) => { if (!v) setRevokeTarget(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Revoke Device
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Revoking{' '}
            <span className="font-medium">"{revokeTarget?.name}"</span> will immediately sign it out
            and prevent it from accessing the system. This cannot be undone — the device will need
            to register again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRevoke}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke Device'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
