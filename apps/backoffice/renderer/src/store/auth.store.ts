import { create } from 'zustand'

interface User {
  id: string
  tenantId: string
  baUserId: string
  email: string
  firstName: string
  lastName: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  initialize: () => Promise<void>
  setAuth: (user: User, accessToken: string) => Promise<void>
  clearAuth: () => Promise<void>
  refreshToken: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,

  initialize: async () => {
    const token = await window.electron.auth.getToken()
    if (!token) {
      set({ user: null, accessToken: null, isAuthenticated: false })
      return
    }

    try {
      // Decode JWT payload (not verify — API verifies on every request)
      const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
      const isExpired = payload.exp * 1000 < Date.now()

      if (isExpired) {
        const refreshed = await get().refreshToken()
        if (!refreshed) {
          await get().clearAuth()
        }
        return
      }

      set({
        accessToken: token,
        user: payload.user,
        isAuthenticated: true,
      })
    } catch {
      await get().clearAuth()
    }
  },

  setAuth: async (user, accessToken) => {
    await window.electron.auth.setToken(accessToken)
    set({ user, accessToken, isAuthenticated: true })
  },

  clearAuth: async () => {
    await window.electron.auth.clear()
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  refreshToken: async () => {
    const refreshToken = await window.electron.auth.getRefresh()
    if (!refreshToken) return false

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) return false

      const data = await response.json() as { accessToken: string; user: User }
      await get().setAuth(data.user, data.accessToken)
      return true
    } catch {
      return false
    }
  },
}))
