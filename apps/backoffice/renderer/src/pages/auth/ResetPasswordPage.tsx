import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { CheckCircle, AlertCircle } from 'lucide-react'

// ─── Schema ───────────────────────────────────────────────────────────────────

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ResetFormValues = z.infer<typeof resetSchema>

// ─── Component ────────────────────────────────────────────────────────────────

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [success, setSuccess] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
  })

  // Invalid / missing token guard
  if (!token) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 text-red-600">
              <AlertCircle size={26} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Invalid reset link</h2>
              <p className="text-sm text-slate-600">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="text-sm text-sky-600 hover:underline pt-1"
            >
              Request a new reset link
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-50 text-green-600">
              <CheckCircle size={26} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Password updated</h2>
              <p className="text-sm text-slate-600">
                Your password has been reset successfully. You can now sign in with your new
                password.
              </p>
            </div>
            <Button
              type="button"
              className="mt-2"
              onClick={() => navigate('/login', { replace: true })}
            >
              Go to sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const onSubmit = async (values: ResetFormValues) => {
    setServerError(null)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: values.password }),
      })

      const data = (await res.json()) as { message?: string }

      if (!res.ok) {
        setServerError(data.message ?? 'Failed to reset password. The link may have expired.')
        return
      }

      setSuccess(true)
    } catch {
      setServerError('Unable to connect to the server. Check your network and try again.')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-center text-lg">Choose a new password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Your new password must be at least 8 characters and include an uppercase letter and
          a number.
        </p>

        {/* Server error */}
        {serverError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* New password */}
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-600">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Updating password…' : 'Update password'}
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
