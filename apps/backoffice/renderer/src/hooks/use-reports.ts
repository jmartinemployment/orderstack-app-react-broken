import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportGroupBy = 'day' | 'week' | 'month' | 'hour' | 'employee' | 'product' | 'category'

export interface SalesReportParams {
  locationId?: string
  dateFrom: string
  dateTo: string
  groupBy?: ReportGroupBy
}

export interface ProductsReportParams {
  locationId?: string
  dateFrom?: string
  dateTo?: string
  categoryId?: string
  groupBy?: ReportGroupBy
}

export interface EmployeesReportParams {
  locationId?: string
  dateFrom?: string
  dateTo?: string
  employeeId?: string
}

export interface InventoryReportParams {
  locationId?: string
  categoryId?: string
  lowStockOnly?: boolean
}

export interface PaymentsReportParams {
  locationId?: string
  dateFrom?: string
  dateTo?: string
  method?: string
}

export interface SalesReportRow {
  period: string
  grossSales: number
  discounts: number
  refunds: number
  netSales: number
  tax: number
  tips: number
  orderCount: number
  averageOrderValue: number
}

export interface SalesReport {
  summary: {
    grossSales: number
    discounts: number
    refunds: number
    netSales: number
    tax: number
    tips: number
    orderCount: number
    averageOrderValue: number
  }
  rows: SalesReportRow[]
}

export interface ProductsReport {
  rows: Array<{
    productId: string
    productName: string
    variantId?: string
    variantName?: string
    quantitySold: number
    grossSales: number
    discounts: number
    netSales: number
    refunds: number
  }>
}

export interface EmployeesReport {
  rows: Array<{
    employeeId: string
    employeeName: string
    grossSales: number
    orderCount: number
    hoursWorked: number
    tips: number
  }>
}

export interface InventoryReport {
  rows: Array<{
    variantId: string
    sku: string
    productName: string
    variantName: string
    locationId: string
    quantityOnHand: number
    reorderPoint?: number
    isLowStock: boolean
    estimatedValue: number
  }>
}

export interface PaymentsReport {
  rows: Array<{
    method: string
    transactionCount: number
    grossAmount: number
    refundedAmount: number
    netAmount: number
    tipAmount: number
  }>
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'
export type ExportStatus = 'pending' | 'processing' | 'complete' | 'failed'
export type ReportType =
  | 'sales'
  | 'products'
  | 'employees'
  | 'inventory'
  | 'payments'

export interface ExportReportBody {
  reportType: ReportType
  format: ExportFormat
  params: Record<string, unknown>
}

export interface ExportJob {
  jobId: string
  status: ExportStatus
  downloadUrl?: string
  error?: string
  createdAt: string
  completedAt?: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const reportKeys = {
  all: ['reports'] as const,
  sales: (params: SalesReportParams) =>
    [...reportKeys.all, 'sales', params] as const,
  products: (params: ProductsReportParams) =>
    [...reportKeys.all, 'products', params] as const,
  employees: (params: EmployeesReportParams) =>
    [...reportKeys.all, 'employees', params] as const,
  inventory: (params: InventoryReportParams) =>
    [...reportKeys.all, 'inventory', params] as const,
  payments: (params: PaymentsReportParams) =>
    [...reportKeys.all, 'payments', params] as const,
  exportStatus: (jobId: string | null) =>
    [...reportKeys.all, 'export-status', jobId] as const,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      qs.set(key, String(value))
    }
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useSalesReport(params: SalesReportParams) {
  return useQuery({
    queryKey: reportKeys.sales(params),
    queryFn: () =>
      api.get<SalesReport>(
        `/reports/sales${toQueryString(params as Record<string, unknown>)}`,
      ),
    enabled: Boolean(params.dateFrom && params.dateTo),
  })
}

export function useProductsReport(params: ProductsReportParams) {
  return useQuery({
    queryKey: reportKeys.products(params),
    queryFn: () =>
      api.get<ProductsReport>(
        `/reports/products${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function useEmployeesReport(params: EmployeesReportParams) {
  return useQuery({
    queryKey: reportKeys.employees(params),
    queryFn: () =>
      api.get<EmployeesReport>(
        `/reports/employees${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function useInventoryReport(params: InventoryReportParams) {
  return useQuery({
    queryKey: reportKeys.inventory(params),
    queryFn: () =>
      api.get<InventoryReport>(
        `/reports/inventory${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function usePaymentsReport(params: PaymentsReportParams) {
  return useQuery({
    queryKey: reportKeys.payments(params),
    queryFn: () =>
      api.get<PaymentsReport>(
        `/reports/payments${toQueryString(params as Record<string, unknown>)}`,
      ),
  })
}

export function useExportStatus(jobId: string | null) {
  return useQuery({
    queryKey: reportKeys.exportStatus(jobId),
    queryFn: () => api.get<ExportJob>(`/reports/exports/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'complete' || status === 'failed' ? false : 3000
    },
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useExportReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExportReportBody) =>
      api.post<{ jobId: string }>('/reports/exports', body),
    onSuccess: () => {
      // Invalidate any cached export status so polling queries re-fetch
      void queryClient.invalidateQueries({
        queryKey: reportKeys.exportStatus(null),
        exact: false,
      })
    },
  })
}
