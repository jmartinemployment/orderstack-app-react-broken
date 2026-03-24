import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Mail, MessageSquare, TrendingUp } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { useCampaigns } from '../../../hooks/use-customers'
import { api } from '../../../lib/api'

// ─── Schema ───────────────────────────────────────────────────────────────────

const campaignSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  channel: z.enum(['email', 'sms']),
  type: z.enum(['one_time', 'automated']),
  subject: z.string().optional(),
  body: z.string().min(1, 'Body is required'),
  segmentId: z.string().optional(),
  scheduledAt: z.string().optional(),
})

type CampaignFormValues = z.infer<typeof campaignSchema>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

function pct(n: number | undefined) {
  if (n === undefined || n === null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-amber-100 text-amber-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CampaignsPage() {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [channel, setChannel] = useState<'email' | 'sms'>('email')

  const { data: campaigns = [], isLoading } = useCampaigns()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { channel: 'email', type: 'one_time' },
  })

  const watchChannel = watch('channel', 'email')

  const openCreate = () => {
    reset({ channel: 'email', type: 'one_time' })
    setChannel('email')
    setServerError(null)
    setOpen(true)
  }

  const onSubmit = async (values: CampaignFormValues) => {
    setServerError(null)
    try {
      await api.post('/campaigns', values)
      setOpen(false)
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to create campaign')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500">Email and SMS marketing campaigns</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Campaign
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
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Channel</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Recipients</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Open Rate</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Click Rate</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">Redemptions</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Send Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : (campaigns as any[]).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No campaigns yet
                    </td>
                  </tr>
                ) : (
                  (campaigns as any[]).map((c) => {
                    const statusCls = STATUS_CLASSES[c.status] ?? STATUS_CLASSES.draft
                    return (
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                        <td className="px-4 py-3">
                          {c.channel === 'email' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-medium">
                              <Mail className="h-3 w-3" /> Email
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 text-purple-700 px-2.5 py-0.5 text-xs font-medium">
                              <MessageSquare className="h-3 w-3" /> SMS
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600">
                          {c.type?.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusCls}`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {(c.recipientCount ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {pct(c.openRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {pct(c.clickRate)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {c.redemptions ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {fmtDate(c.scheduledAt ?? c.sentAt)}
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

      {/* Create Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-name">Campaign Name</Label>
              <Input id="c-name" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Channel</Label>
                <Select
                  defaultValue="email"
                  onValueChange={(v) => {
                    setValue('channel', v as any)
                    setChannel(v as any)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select defaultValue="one_time" onValueChange={(v) => setValue('type', v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">One-time</SelectItem>
                    <SelectItem value="automated">Automated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {watchChannel === 'email' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-subject">Subject Line</Label>
                <Input id="c-subject" {...register('subject')} />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-body">{watchChannel === 'email' ? 'Email Body' : 'SMS Body'}</Label>
              <textarea
                id="c-body"
                rows={5}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                placeholder={watchChannel === 'email' ? 'HTML or plain text…' : 'SMS message (160 chars recommended)'}
                {...register('body')}
              />
              {errors.body && <p className="text-xs text-red-500">{errors.body.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-segment">Segment (optional)</Label>
              <Input id="c-segment" placeholder="Segment ID or name" {...register('segmentId')} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-schedule">Schedule Date (optional)</Label>
              <Input id="c-schedule" type="datetime-local" {...register('scheduledAt')} />
            </div>

            {serverError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create Campaign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
