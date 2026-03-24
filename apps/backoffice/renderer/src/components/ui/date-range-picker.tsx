import { Input } from '@orderstack/ui'
import { Label } from '@orderstack/ui'

interface DateRangePickerProps {
  from: string
  to: string
  onFromChange: (val: string) => void
  onToChange: (val: string) => void
  label?: string
}

export function DateRangePicker({ from, to, onFromChange, onToChange, label }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <Label className="shrink-0 text-sm text-slate-600">{label}</Label>}
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-36"
        />
        <span className="text-slate-400 text-sm">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="w-36"
        />
      </div>
    </div>
  )
}
