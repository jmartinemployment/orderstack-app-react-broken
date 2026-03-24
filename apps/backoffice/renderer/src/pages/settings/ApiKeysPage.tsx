import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Copy, Check, AlertTriangle, Trash2, Key } from 'lucide-react'
import {
  Button,
  Input,
  Label,
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
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../../hooks/use-settings'

// ─── Available Scopes ─────────────────────────────────────────────────────────

const ALL_SCOPES = [
  { id: 'orders:read', label: 'Orders Read' },
  { id: 'orders:write', label: 'Orders Write' },
  { id: 'products:read', label: 'Products Read' },
  { id: 'products:write', label: 'Products Write' },
  { id: 'customers:read', label: 'Customers Read' },
  { id: 'customers:write', label: 'Customers Write' },
  { id: 'payments:read', label: 'Payments Read' },
  { id: 'payments:write', label: 'Payments Write' },
  { id: 'reports:read', label: 'Reports Read' },
  { id: 'inventory:read', label: 'Inventory Read' },
  { id: 'inventory:write', label: 'Inventory Write' },
  { id: 'webhooks:write', label: 'Webhooks Write' },
]

// ─── Schema ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  expiresAt: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null)

  const { data: keys = [], isLoading } = useApiKeys()
  const createMutation = useCreateApiKey()
  const revokeMutation = useRevokeApiKey()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) })

  const openCreate = () => {
    reset()
    setSelectedScopes([])
    setCreateOpen(true)
  }

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId],
    )
  }

  const onSubmit = async (values: CreateFormValues) => {
    const result = await createMutation.mutateAsync({
      name: values.name,
      scopes: selectedScopes,
      expiresAt: values.expiresAt || undefined,
    })
    setCreateOpen(false)
    setCreatedKey(result.key)
  }

  const copyKey = () => {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const confirmRevoke = async () => {
    if (!revokeTarget) return
    await revokeMutation.mutateAsync(revokeTarget.id)
    setRevokeTarget(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
          <p className="text-sm text-slate-500">
            {(keys as any[]).length} key{(keys as any[]).length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create API Key
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
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Key Prefix</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Scopes</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Last Used</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Expires</th>
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
                ) : (keys as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No API keys yet
                    </td>
                  </tr>
                ) : (
                  (keys as any[]).map((k) => (
                    <tr key={k.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{k.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        <span className="flex items-center gap-1">
                          <Key className="h-3.5 w-3.5 text-slate-400" />
                          {k.prefix}…
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(k.scopes ?? []).slice(0, 3).map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                          {(k.scopes ?? []).length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{k.scopes.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(k.lastUsedAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(k.expiresAt)}</td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRevokeTarget(k)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ak-name">Key Name</Label>
              <Input id="ak-name" placeholder="e.g. POS Integration" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Scopes</Label>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3">
                {ALL_SCOPES.map((scope) => (
                  <label
                    key={scope.id}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={selectedScopes.includes(scope.id)}
                      onChange={() => toggleScope(scope.id)}
                    />
                    <span className="text-sm text-slate-700">{scope.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ak-expiry">Expiry Date (optional)</Label>
              <Input id="ak-expiry" type="date" {...register('expiresAt')} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || selectedScopes.length === 0}>
                {isSubmitting ? 'Creating…' : 'Create Key'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Show Key Once Modal */}
      <Dialog
        open={Boolean(createdKey)}
        onOpenChange={(v) => { if (!v) setCreatedKey(null) }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-500" /> API Key Created
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 mb-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                This is the only time your full API key will be shown. Copy it now and store it
                securely — it cannot be retrieved again.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <code className="flex-1 break-all text-sm font-mono text-slate-800">{createdKey}</code>
            <Button variant="outline" size="sm" onClick={copyKey} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(v) => { if (!v) setRevokeTarget(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Revoking <span className="font-medium">"{revokeTarget?.name}"</span> will immediately
            invalidate all requests using it. This cannot be undone.
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
              {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
