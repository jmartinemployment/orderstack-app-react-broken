import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router'
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingCart,
  Package,
  Users,
  UserCheck,
  Tag,
  CreditCard,
  BarChart2,
  BookOpen,
  Settings,
  ChevronDown,
  ChevronRight,
  Bell,
  LogOut,
  Monitor,
  Key,
  Webhook,
  MapPin,
  Receipt,
  TrendingUp,
  ClipboardList,
  Calendar,
  Clock,
  Heart,
  Gift,
  Megaphone,
  Percent,
  DollarSign,
  Layers,
  FolderKanban,
  Boxes,
} from 'lucide-react'
import { Button } from '@orderstack/ui'
import { useAuthStore } from '../store/auth.store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface NavGroup {
  label: string
  icon: React.ReactNode
  items?: NavItem[]
  href?: string
}

// ─── Nav definition ───────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    icon: <LayoutDashboard size={16} />,
    href: '/dashboard',
  },
  {
    label: 'Menu',
    icon: <UtensilsCrossed size={16} />,
    items: [
      { label: 'Products', href: '/menu/products', icon: <Layers size={14} /> },
      { label: 'Categories', href: '/menu/categories', icon: <FolderKanban size={14} /> },
      { label: 'Modifier Groups', href: '/menu/modifier-groups', icon: <ClipboardList size={14} /> },
      { label: 'Menus', href: '/menu/menus', icon: <BookOpen size={14} /> },
    ],
  },
  {
    label: 'Orders',
    icon: <ShoppingCart size={16} />,
    href: '/orders',
  },
  {
    label: 'Inventory',
    icon: <Package size={16} />,
    items: [
      { label: 'Inventory', href: '/inventory', icon: <Boxes size={14} /> },
      { label: 'Purchase Orders', href: '/inventory/purchase-orders', icon: <ClipboardList size={14} /> },
      { label: 'Vendors', href: '/inventory/vendors', icon: <UserCheck size={14} /> },
    ],
  },
  {
    label: 'Employees',
    icon: <Users size={16} />,
    items: [
      { label: 'Employees', href: '/employees', icon: <Users size={14} /> },
      { label: 'Schedules', href: '/employees/schedules', icon: <Calendar size={14} /> },
      { label: 'Timesheets', href: '/employees/timesheets', icon: <Clock size={14} /> },
    ],
  },
  {
    label: 'Customers',
    icon: <Heart size={16} />,
    items: [
      { label: 'Customers', href: '/customers', icon: <Users size={14} /> },
      { label: 'Loyalty', href: '/customers/loyalty', icon: <Heart size={14} /> },
      { label: 'Gift Cards', href: '/customers/gift-cards', icon: <Gift size={14} /> },
      { label: 'Campaigns', href: '/customers/campaigns', icon: <Megaphone size={14} /> },
    ],
  },
  {
    label: 'Promotions',
    icon: <Tag size={16} />,
    items: [
      { label: 'Discounts', href: '/promotions/discounts', icon: <Percent size={14} /> },
    ],
  },
  {
    label: 'Payments',
    icon: <CreditCard size={16} />,
    href: '/payments',
  },
  {
    label: 'Reports',
    icon: <BarChart2 size={16} />,
    items: [
      { label: 'Sales', href: '/reports/sales', icon: <TrendingUp size={14} /> },
      { label: 'Labor', href: '/reports/labor', icon: <Users size={14} /> },
      { label: 'Product Mix', href: '/reports/product-mix', icon: <BarChart2 size={14} /> },
      { label: 'Inventory', href: '/reports/inventory', icon: <Package size={14} /> },
    ],
  },
  {
    label: 'Accounting',
    icon: <DollarSign size={16} />,
    href: '/accounting',
  },
  {
    label: 'Settings',
    icon: <Settings size={16} />,
    items: [
      { label: 'Devices', href: '/settings/devices', icon: <Monitor size={14} /> },
      { label: 'API Keys', href: '/settings/api-keys', icon: <Key size={14} /> },
      { label: 'Webhooks', href: '/settings/webhooks', icon: <Webhook size={14} /> },
      { label: 'Locations', href: '/settings/locations', icon: <MapPin size={14} /> },
      { label: 'Taxes', href: '/settings/taxes', icon: <Receipt size={14} /> },
    ],
  },
]

// ─── Page title map ───────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/menu/products': 'Products',
  '/menu/categories': 'Categories',
  '/menu/modifier-groups': 'Modifier Groups',
  '/menu/menus': 'Menus',
  '/orders': 'Orders',
  '/inventory': 'Inventory',
  '/inventory/purchase-orders': 'Purchase Orders',
  '/inventory/vendors': 'Vendors',
  '/employees': 'Employees',
  '/employees/schedules': 'Schedules',
  '/employees/timesheets': 'Timesheets',
  '/customers': 'Customers',
  '/customers/loyalty': 'Loyalty',
  '/customers/gift-cards': 'Gift Cards',
  '/customers/campaigns': 'Campaigns',
  '/promotions/discounts': 'Discounts',
  '/payments': 'Payments',
  '/reports': 'Reports',
  '/reports/sales': 'Sales Report',
  '/reports/labor': 'Labor Report',
  '/reports/product-mix': 'Product Mix Report',
  '/reports/inventory': 'Inventory Report',
  '/accounting': 'Accounting',
  '/settings/devices': 'Devices',
  '/settings/api-keys': 'API Keys',
  '/settings/webhooks': 'Webhooks',
  '/settings/locations': 'Locations',
  '/settings/taxes': 'Taxes',
}

function getPageTitle(pathname: string): string {
  // Try exact match first, then prefix match for detail pages
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const base = Object.keys(PAGE_TITLES)
    .filter((k) => pathname.startsWith(k) && k !== '/')
    .sort((a, b) => b.length - a.length)[0]
  return base ? (PAGE_TITLES[base] ?? 'OrderStack') : 'OrderStack'
}

// ─── NavGroup component ───────────────────────────────────────────────────────

function SidebarNavGroup({
  group,
  pathname,
  defaultOpen,
}: {
  group: NavGroup
  pathname: string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  // Single-item group (direct link)
  if (group.href) {
    const isActive = pathname === group.href || pathname.startsWith(group.href + '/')
    return (
      <Link
        to={group.href}
        className={[
          'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-sky-500/15 text-sky-400'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
        ].join(' ')}
      >
        <span className="shrink-0">{group.icon}</span>
        {group.label}
      </Link>
    )
  }

  // Group with children
  const groupActive = group.items?.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  ) ?? false

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          groupActive
            ? 'text-slate-200'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
        ].join(' ')}
      >
        <span className="shrink-0">{group.icon}</span>
        <span className="flex-1 text-left">{group.label}</span>
        <span className="shrink-0 text-slate-600">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="mt-0.5 ml-3 pl-3 border-l border-slate-800 space-y-0.5">
          {group.items?.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                to={item.href}
                className={[
                  'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-sky-500/15 text-sky-400 font-medium'
                    : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300',
                ].join(' ')}
              >
                <span className="shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main layout ──────────────────────────────────────────────────────────────

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()

  const pageTitle = getPageTitle(location.pathname)

  const handleLogout = async () => {
    await clearAuth()
    navigate('/login', { replace: true })
  }

  const userInitials = user
    ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()
    : '?'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── Sidebar ── */}
      <aside className="flex flex-col w-60 shrink-0 bg-slate-900 border-r border-slate-800 overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-800">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500 shadow">
            <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5 text-white" aria-hidden="true">
              <path
                d="M3 6h18M3 12h18M3 18h12"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-base font-bold text-white tracking-tight">OrderStack</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_GROUPS.map((group) => {
            const defaultOpen =
              !group.href &&
              (group.items?.some(
                (item) =>
                  location.pathname === item.href ||
                  location.pathname.startsWith(item.href + '/'),
              ) ?? false)

            return (
              <SidebarNavGroup
                key={group.label}
                group={group}
                pathname={location.pathname}
                defaultOpen={defaultOpen}
              />
            )
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-3 border-t border-slate-800">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-600 text-white text-xs font-semibold shrink-0 select-none">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">
                {user ? `${user.firstName} ${user.lastName}` : 'Unknown'}
              </p>
              <p className="text-xs text-slate-500 truncate">{user?.email ?? ''}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center justify-between h-14 px-6 bg-white border-b border-slate-200 shrink-0">
          <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900" aria-label="Notifications">
              <Bell size={18} />
            </Button>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-600 text-white text-xs font-semibold select-none cursor-default">
              {userInitials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
