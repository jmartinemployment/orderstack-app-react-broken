import { Outlet } from 'react-router'

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500 shadow-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-6 h-6 text-white"
              aria-hidden="true"
            >
              <path
                d="M3 6h18M3 12h18M3 18h12"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">OrderStack</span>
        </div>

        {/* Page content */}
        <Outlet />
      </div>
    </div>
  )
}
