import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Button, Input, Label, Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { useAuthStore } from '../../store/auth.store'

// ─── Schema ───────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormValues = z.infer<typeof loginSchema>

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoginSuccessResponse {
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

interface LoginMfaResponse {
  requiresMfa: true
  mfaToken: string
}

type LoginApiResponse = LoginSuccessResponse | LoginMfaResponse

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null)

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      })

      const data = (await res.json()) as LoginApiResponse

      if (!res.ok) {
        const msg = (data as { message?: string }).message ?? 'Login failed. Please try again.'
        setServerError(msg)
        return
      }

      // MFA required
      if ('requiresMfa' in data && data.requiresMfa) {
        navigate('/mfa', { state: { mfaToken: data.mfaToken, email: values.email } })
        return
      }

      // Full login success
      const successData = data as LoginSuccessResponse
      await window.electron.auth.setRefresh(successData.refreshToken)
      await setAuth(successData.user, successData.accessToken)
      navigate('/dashboard', { replace: true })
    } catch {
      setServerError('Unable to connect to the server. Check your network and try again.')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-center text-lg">Sign in to your account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* Server error */}
          {serverError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          {/* Email */}
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

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-xs text-sky-600 hover:text-sky-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
