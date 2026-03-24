import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  CheckCircle,
  XCircle,
  Plus,
  Download,
  RefreshCw,
  Edit2,
  ExternalLink,
} from 'lucide-react'
import {
  Button,
  Input,
  Label,
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import {
  useChartOfAccounts,
  useGlExports,
  useCreateGlExport,
  accountingKeys,
  type GlAccount,
} from '../../hooks/use-settings'

// ---------------------------------------------------------------------------
// Local account mutations (useCreateAccount / useUpdateAccount not in hook)
// ---------------------------------------------------------------------------

function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { code: string; name: string; type: GlAccount['type']; description?: string }) =>
      api.post<GlAccount>('/accounting/chart-of-accounts', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.chartOfAccounts() })
    },
  })
}

function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; code: string; name: string; type: GlAccount['type']; description?: string }) =>
      api.patch<GlAccount>(`/accounting/chart-of-accounts/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountingKeys.chartOfAccounts() })
    },
  })
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const accountSchema = z.object({
  code: z.string().min(1, 'Code required'),
  name: z.string().min(1, 'Name required'),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  description: z.string().optional(),
})

type AccountFormValues = z.infer<typeof accountSchema>

const exportSchema = z.object({
  dateFrom: z.string().min(1, 'Required'),
  dateTo: z.string().min(1, 'Required'),
  type: z.enum(['journal_entries', 'sales_summary', 'full']).default('full'),
})

type ExportFormValues = z.infer<typeof exportSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

const EXPORT_STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

// ─── Integration Card ─────────────────────────────────────────────────────────

function IntegrationCard({
  name,
  logo,
  connected,
  onConnect,
  onDisconnect,
}: {
  name: string
  logo: string
  connected: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{logo}</span>
          <div>
            <p className="font-semibold text-slate-900">{name}</p>
            <div className="flex items-center gap-1 text-xs mt-0.5">
              {connected ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-green-600">Connected</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-500">Not connected</span>
                </>
              )}
            </div>
          </div>
        </div>
        {connected ? (
          <Button variant="outline" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={onConnect}>
            Connect
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountingPage() {
  const [qboConnected, setQboConnected] = useState(false)
  const [xeroConnected, setXeroConnected] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<any | null>(null)
  const [exportOpen, setExportOpen] = useState(false)

  const { data: accounts = [], isLoading: loadingAccounts } = useChartOfAccounts()
  const { data: exports = [], isLoading: loadingExports } = useGlExports()
  const createExportMutation = useCreateGlExport()
  const createAccountMutation = useCreateAccount()
  const updateAccountMutation = useUpdateAccount()

  const {
    register: regAcc,
    handleSubmit: submitAcc,
    reset: resetAcc,
    formState: { errors: accErrors, isSubmitting: savingAcc },
  } = useForm<AccountFormValues>({ resolver: zodResolver(accountSchema) })

  const {
    register: regExport,
    handleSubmit: submitExport,
    reset: resetExport,
    formState: { errors: expErrors, isSubmitting: exporting },
  } = useForm<ExportFormValues>({ resolver: zodResolver(exportSchema) })

  const openConnectQbo = () => {
    window.electron.app.openExternal('https://appcenter.intuit.com/connect/oauth2?...')
    // In real app, listen for deep link callback
    setTimeout(() => setQboConnected(true), 2000)
  }

  const openConnectXero = () => {
    window.electron.app.openExternal('https://login.xero.com/identity/connect/authorize?...')
    setTimeout(() => setXeroConnected(true), 2000)
  }

  const openCreateAccount = () => {
    resetAcc({ type: 'revenue' })
    setEditAccount(null)
    setAccountOpen(true)
  }

  const openEditAccount = (a: any) => {
    setEditAccount(a)
    resetAcc({ code: a.code, name: a.name, type: a.type, description: a.description ?? '' })
    setAccountOpen(true)
  }

  const onAccountSubmit = async (values: AccountFormValues) => {
    if (editAccount) {
      await updateAccountMutation.mutateAsync({ id: editAccount.id, ...values })
    } else {
      await createAccountMutation.mutateAsync(values)
    }
    setAccountOpen(false)
  }

  const onExportSubmit = async (values: ExportFormValues) => {
    await createExportMutation.mutateAsync(values)
    resetExport()
    setExportOpen(false)
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Accounting</h1>
        <p className="text-sm text-slate-500">Integrations and GL exports</p>
      </div>

      {/* Integration Cards */}
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-3">Connections</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
          <IntegrationCard
            name="QuickBooks Online"
            logo="📊"
            connected={qboConnected}
            onConnect={openConnectQbo}
            onDisconnect={() => setQboConnected(false)}
          />
          <IntegrationCard
            name="Xero"
            logo="💼"
            connected={xeroConnected}
            onConnect={openConnectXero}
            onDisconnect={() => setXeroConnected(false)}
          />
        </div>
      </div>

      {/* Chart of Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-700">Chart of Accounts</h2>
          <Button size="sm" onClick={openCreateAccount}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Account
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Code</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Description</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAccounts ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  ) : (accounts as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No accounts yet
                      </td>
                    </tr>
                  ) : (
                    (accounts as any[]).map((a) => (
                      <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700">{a.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                        <td className="px-4 py-3 capitalize text-slate-600">{a.type}</td>
                        <td className="px-4 py-3 text-slate-500">{a.description ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditAccount(a)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
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
      </div>

      {/* GL Export */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-700">GL Export</h2>
          <Button size="sm" onClick={() => { resetExport(); setExportOpen(true) }}>
            <Download className="mr-1.5 h-4 w-4" /> New Export
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Period</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingExports ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  ) : (exports as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No exports yet
                      </td>
                    </tr>
                  ) : (
                    (exports as any[]).map((e) => {
                      const statusCls =
                        EXPORT_STATUS_CLASSES[e.status] ?? EXPORT_STATUS_CLASSES.pending
                      return (
                        <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{fmtDate(e.createdAt)}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {fmtDate(e.dateFrom)} – {fmtDate(e.dateTo)}
                          </td>
                          <td className="px-4 py-3 capitalize text-slate-600">
                            {e.type?.replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {e.status === 'processing' && (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                              )}
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusCls}`}
                              >
                                {e.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {e.downloadUrl ? (
                              <a
                                href={e.downloadUrl}
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                                download
                              >
                                <Download className="h-3.5 w-3.5" /> Download
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
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
      </div>

      {/* Account Modal */}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editAccount ? 'Edit Account' : 'Add Account'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAcc(onAccountSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-code">Account Code</Label>
                <Input id="acc-code" placeholder="4000" {...regAcc('code')} />
                {accErrors.code && (
                  <p className="text-xs text-red-500">{accErrors.code.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-type">Type</Label>
                <select
                  id="acc-type"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                  {...regAcc('type')}
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-name">Account Name</Label>
              <Input id="acc-name" {...regAcc('name')} />
              {accErrors.name && (
                <p className="text-xs text-red-500">{accErrors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-desc">Description</Label>
              <Input id="acc-desc" {...regAcc('description')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccountOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingAcc}>
                {savingAcc ? 'Saving…' : editAccount ? 'Save Changes' : 'Add Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New GL Export</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitExport(onExportSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-from">From</Label>
                <Input id="exp-from" type="date" {...regExport('dateFrom')} />
                {expErrors.dateFrom && (
                  <p className="text-xs text-red-500">{expErrors.dateFrom.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="exp-to">To</Label>
                <Input id="exp-to" type="date" {...regExport('dateTo')} />
                {expErrors.dateTo && (
                  <p className="text-xs text-red-500">{expErrors.dateTo.message}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-type">Export Type</Label>
              <select
                id="exp-type"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                {...regExport('type')}
              >
                <option value="full">Full Export</option>
                <option value="journal_entries">Journal Entries</option>
                <option value="sales_summary">Sales Summary</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={exporting}>
                {exporting ? 'Exporting…' : 'Start Export'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
