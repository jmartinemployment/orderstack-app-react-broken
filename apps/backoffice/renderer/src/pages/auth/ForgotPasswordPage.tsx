import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { CheckCircle } from 'lucide-react'

// ─── Schema ───────────────────────────────────────────────────────────────────

const forgotSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
})

type ForgotFormValues = z.infer<typeof forgotSchema>

// ─── Component ────────────────────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (values: ForgotFormValues) => {
    setServerError(null)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      })

      // Treat any 2xx as success (some APIs return 200 even when email not found
      // to prevent user enumeration)
      if (!res.ok) {
        const data = (await res.json()) as { message?: string }
        setServerError(data.message ?? 'Something went wrong. Please try again.')
        return
      }

      setSubmittedEmail(values.email)
      setSubmitted(true)
    } catch {
      setServerError('Unable to connect to the server. Check your network and try again.')
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600">
              <CheckCircle size={26} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Check your inbox</h2>
              <p className="text-sm text-slate-600">
                If an account exists for{' '}
                <span className="font-medium text-slate-800">{submittedEmail}</span>, you'll
                receive a password reset link shortly.
              </p>
            </div>
            <p className="text-xs text-slate-500 pt-1">
              Didn't receive it? Check your spam folder or{' '}
              <button
                type="button"
                className="text-sky-600 hover:underline"
                onClick={() => {
                  setSubmitted(false)
                  setServerError(null)
                }}
              >
                try again
              </button>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-center text-lg">Reset your password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Enter the email address associated with your account and we'll send you a link to
          reset your password.
        </p>

        {/* Server error */}
        {serverError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending reset link…' : 'Send reset link'}
          </Button>
        </form>

        <p className="text-xs text-center text-slate-500">
          Remember your password?{' '}
          <Link to="/login" className="text-sky-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
