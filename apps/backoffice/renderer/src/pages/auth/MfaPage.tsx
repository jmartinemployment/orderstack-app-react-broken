import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MfaLocationState {
  mfaToken?: string
  email?: string
}

interface MfaSuccessResponse {
  user: {
    id: string
    tenantId: string
    baUserId: string
    email: string
    firstName: string
    lastName: string
  }
  accessToken: string
  refreshToken: string
}

// ─── Component ────────────────────────────────────────────────────────────────

const DIGIT_COUNT = 6

export function MfaPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const state = (location.state ?? {}) as MfaLocationState

  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''))
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Auto-focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const submitCode = async (code: string) => {
    if (isSubmitting) return
    setServerError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, mfaToken: state.mfaToken }),
      })

      const data = (await res.json()) as MfaSuccessResponse & { message?: string }

      if (!res.ok) {
        setServerError(data.message ?? 'Invalid code. Please try again.')
        // Clear digits and refocus
        setDigits(Array(DIGIT_COUNT).fill(''))
        setTimeout(() => inputRefs.current[0]?.focus(), 0)
        return
      }

      await window.electron.auth.setRefresh(data.refreshToken)
      await setAuth(data.user, data.accessToken)
      navigate('/dashboard', { replace: true })
    } catch {
      setServerError('Unable to connect to the server. Check your network and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (index: number, value: string) => {
    // Allow pasting a full 6-digit code into any input
    const sanitized = value.replace(/\D/g, '')
    if (sanitized.length === DIGIT_COUNT) {
      const next = sanitized.split('')
      setDigits(next)
      inputRefs.current[DIGIT_COUNT - 1]?.focus()
      void submitCode(sanitized)
      return
    }

    const single = sanitized.slice(-1)
    const next = [...digits]
    next[index] = single
    setDigits(next)

    if (single && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when the last digit is filled
    const complete = next.join('')
    if (complete.length === DIGIT_COUNT && next.every((d) => d !== '')) {
      void submitCode(complete)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
      }
    }
  }

  const currentCode = digits.join('')
  const isComplete = currentCode.length === DIGIT_COUNT && digits.every((d) => d !== '')

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-sky-50 text-sky-600">
            <ShieldCheck size={22} />
          </div>
          <CardTitle className="text-center text-lg">Two-factor authentication</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-center text-slate-600">
          Enter the 6-digit code from your authenticator app
          {state.email ? (
            <>
              {' '}for{' '}
              <span className="font-medium text-slate-800">{state.email}</span>
            </>
          ) : null}
          .
        </p>

        {/* Server error */}
        {serverError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm text-center text-red-700">{serverError}</p>
          </div>
        )}

        {/* 6-digit inputs */}
        <div className="flex justify-center gap-2" role="group" aria-label="One-time code">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              aria-label={`Digit ${i + 1}`}
              className={[
                'w-10 h-12 rounded-md border text-center text-lg font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500',
                digit
                  ? 'border-sky-400 bg-sky-50 text-sky-800'
                  : 'border-slate-300 bg-white text-slate-900',
              ].join(' ')}
              disabled={isSubmitting}
            />
          ))}
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!isComplete || isSubmitting}
          onClick={() => void submitCode(currentCode)}
        >
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </Button>

        <p className="text-xs text-center text-slate-500">
          Lost access to your authenticator?{' '}
          <button
            type="button"
            className="text-sky-600 hover:underline"
            onClick={() => navigate('/login')}
          >
            Back to sign in
          </button>
        </p>
      </CardContent>
    </Card>
  )
}
