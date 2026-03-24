import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Users,
  AlertTriangle,
} from 'lucide-react'
import { Badge } from '@orderstack/ui'
import { Card, CardHeader, CardTitle, CardContent } from '@orderstack/ui'
import { api } from '../../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesBreakdownRow {
  period: string
  grossSales: number
  netSales: number
  orderCount: number
}

interface SalesSummary {
  grossSales: number
  netSales: number
  orderCount: number
  avgOrderValue: number
  tips: number
  refunds: number
  taxCollected: number
}

interface SalesReport {
  summary: SalesSummary
  breakdown: SalesBreakdownRow[]
}

interface ProductMixRow {
  productVariantId: string
  productName: string
  variantName: string
  totalQuantity: number
  totalRevenue: number
  percentOfSales: number
}

interface ProductMixReport {
  data: ProductMixRow[]
  totalRevenue: number
}

interface Order {
  id: string
  orderNumber?: string
  status: string
  total: number
  orderType: string
  createdAt: string
}

interface OrdersResponse {
  data: Order[]
  meta: { total: number; page: number; limit: number }
}

interface InventoryLevel {
  id: string
  productVariantId: string
  quantityOnHand: number
  reorderPoint: number | null
  isLowStock: boolean
  unitOfMeasure: string
}

interface InventoryResponse {
  data: InventoryLevel[]
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useSalesReport(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['reports', 'sales', dateFrom, dateTo],
    queryFn: () =>
      api.get<SalesReport>(
        `/reports/sales?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&groupBy=day`,
      ),
    refetchInterval: 30_000,
  })
}

function useProductsReport(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['reports', 'products', dateFrom, dateTo],
    queryFn: () =>
      api.get<ProductMixReport>(
        `/reports/products?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
      ),
    refetchInterval: 30_000,
  })
}

function useOrders(limit: number) {
  return useQuery({
    queryKey: ['orders', 'recent', limit],
    queryFn: () => api.get<OrdersResponse>(`/orders?limit=${limit}`),
    refetchInterval: 30_000,
  })
}

function useInventory(locationId: string | null) {
  return useQuery({
    queryKey: ['inventory', locationId],
    queryFn: () => api.get<InventoryResponse>(`/inventory?locationId=${locationId}`),
    enabled: locationId !== null,
    refetchInterval: 30_000,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayRange() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { from: start.toISOString(), to: end.toISOString() }
}

function last7DaysRange() {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setDate(start.getDate() - 6)
  start.setHours(0, 0, 0, 0)
  return { from: start.toISOString(), to: end.toISOString() }
}

function orderStatusVariant(
  status: string,
): 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'in_progress':
    case 'ready':
      return 'warning'
    case 'cancelled':
    case 'voided':
      return 'destructive'
    default:
      return 'secondary'
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string
  value: string
  icon: React.ElementType
  subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50">
            <Icon className="h-6 w-6 text-sky-500" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Hard-coded active location for inventory panel. In a real app this would come
// from the device/session store.
const ACTIVE_LOCATION_ID = 'default'

export function DashboardPage() {
  const today = todayRange()
  const last7 = last7DaysRange()

  const salesToday = useSalesReport(today.from, today.to)
  const sales7Days = useSalesReport(last7.from, last7.to)
  const productsMix = useProductsReport(today.from, today.to)
  const recentOrders = useOrders(10)
  const inventory = useInventory(ACTIVE_LOCATION_ID)

  const summary = salesToday.data?.summary
  const breakdown = sales7Days.data?.breakdown ?? []
  const topProducts = (productsMix.data?.data ?? []).slice(0, 10)
  const orders = recentOrders.data?.data ?? []
  const lowStock = (inventory.data?.data ?? []).filter((i) => i.isLowStock)

  const chartData = breakdown.map((row) => ({
    date: formatDate(String(row.period)),
    revenue: row.grossSales,
    orders: row.orderCount,
  }))

  const barData = topProducts.map((p) => ({
    name:
      p.variantName && p.variantName !== p.productName
        ? `${p.productName} – ${p.variantName}`
        : p.productName,
    revenue: p.totalRevenue,
  }))

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Today's Revenue"
          value={summary ? formatCurrency(summary.grossSales) : '—'}
          icon={DollarSign}
          subtitle={summary ? `Net ${formatCurrency(summary.netSales)}` : undefined}
        />
        <KpiCard
          title="Orders Today"
          value={summary ? String(summary.orderCount) : '—'}
          icon={ShoppingCart}
          subtitle={summary ? `${summary.orderCount} transactions` : undefined}
        />
        <KpiCard
          title="Avg Order Value"
          value={summary ? formatCurrency(summary.avgOrderValue) : '—'}
          icon={TrendingUp}
          subtitle={summary ? `Tips ${formatCurrency(summary.tips)}` : undefined}
        />
        <KpiCard
          title="Active Staff"
          value="—"
          icon={Users}
          subtitle="Clock-in data"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue line chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {sales7Days.isLoading ? (
              <div className="flex h-52 items-center justify-center text-sm text-slate-400">
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v as number / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top products bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Products Today</CardTitle>
          </CardHeader>
          <CardContent>
            {productsMix.isLoading ? (
              <div className="flex h-52 items-center justify-center text-sm text-slate-400">
                Loading…
              </div>
            ) : barData.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-slate-400">
                No sales data yet today
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v as number / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  />
                  <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent orders table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentOrders.isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                Loading…
              </div>
            ) : orders.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                No orders yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                        Order
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-900">
                          #{order.orderNumber ?? order.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600">
                          {order.orderType.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={orderStatusVariant(order.status)} className="capitalize">
                            {order.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-right font-medium text-slate-900">
                          {formatCurrency(order.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Low Stock Alerts</CardTitle>
              {lowStock.length > 0 && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {lowStock.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {inventory.isLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                Loading…
              </div>
            ) : lowStock.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                All items well stocked
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center justify-between px-6 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {item.productVariantId}
                      </p>
                      <p className="text-xs text-slate-400">{item.unitOfMeasure}</p>
                    </div>
                    <div className="ml-3 text-right">
                      <p className="text-sm font-semibold text-red-600">
                        {item.quantityOnHand}
                      </p>
                      {item.reorderPoint !== null && (
                        <p className="text-xs text-slate-400">
                          min {item.reorderPoint}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
