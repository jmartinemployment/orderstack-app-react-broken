import { createHashRouter, redirect } from 'react-router'
import { useAuthStore } from './store/auth.store'
import { useDeviceStore } from './store/device.store'

// Layouts
import { AuthLayout } from './layouts/AuthLayout'
import { AppLayout } from './layouts/AppLayout'

// Auth pages
import { LoginPage } from './pages/auth/LoginPage'
import { MfaPage } from './pages/auth/MfaPage'
import { DeviceRegisterPage } from './pages/auth/DeviceRegisterPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'

// App pages
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { ProductsPage } from './pages/menu/ProductsPage'
import { ProductDetailPage } from './pages/menu/ProductDetailPage'
import { CategoriesPage } from './pages/menu/CategoriesPage'
import { ModifierGroupsPage } from './pages/menu/ModifierGroupsPage'
import { MenusPage } from './pages/menu/MenusPage'
import { MenuDetailPage } from './pages/menu/MenuDetailPage'
import { OrdersPage } from './pages/orders/OrdersPage'
import { OrderDetailPage } from './pages/orders/OrderDetailPage'
import { InventoryPage } from './pages/inventory/InventoryPage'
import { PurchaseOrdersPage } from './pages/inventory/PurchaseOrdersPage'
import { PurchaseOrderDetailPage } from './pages/inventory/PurchaseOrderDetailPage'
import { VendorsPage } from './pages/inventory/VendorsPage'
import { EmployeesPage } from './pages/employees/EmployeesPage'
import { EmployeeDetailPage } from './pages/employees/EmployeeDetailPage'
import { SchedulesPage } from './pages/employees/SchedulesPage'
import { TimesheetsPage } from './pages/employees/TimesheetsPage'
import { CustomersPage } from './pages/customers/CustomersPage'
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage'
import { LoyaltyPage } from './pages/customers/LoyaltyPage'
import { GiftCardsPage } from './pages/customers/GiftCardsPage'
import { CampaignsPage } from './pages/customers/CampaignsPage'
import { DiscountsPage } from './pages/promotions/DiscountsPage'
import { PaymentsPage } from './pages/payments/PaymentsPage'
import { PaymentDetailPage } from './pages/payments/PaymentDetailPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { SalesReportPage } from './pages/reports/SalesReportPage'
import { LaborReportPage } from './pages/reports/LaborReportPage'
import { ProductMixReportPage } from './pages/reports/ProductMixReportPage'
import { InventoryReportPage } from './pages/reports/InventoryReportPage'
import { AccountingPage } from './pages/accounting/AccountingPage'
import { DevicesPage } from './pages/settings/DevicesPage'
import { ApiKeysPage } from './pages/settings/ApiKeysPage'
import { WebhooksPage } from './pages/settings/WebhooksPage'
import { LocationsPage } from './pages/settings/LocationsPage'
import { TaxesPage } from './pages/settings/TaxesPage'

function requireAuth() {
  const { isAuthenticated } = useAuthStore.getState()
  if (!isAuthenticated) return redirect('/login')
  return null
}

function requireDevice() {
  const { isRegistered } = useDeviceStore.getState()
  if (!isRegistered) return redirect('/register-device')
  return null
}

function requireAuthAndDevice() {
  return requireDevice() ?? requireAuth()
}

export const router = createHashRouter([
  // ─── Auth routes (no sidebar) ──────────────────────────────────────────────
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/mfa', element: <MfaPage /> },
      { path: '/register-device', element: <DeviceRegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },

  // ─── App routes (with sidebar, require auth + device) ──────────────────────
  {
    element: <AppLayout />,
    loader: requireAuthAndDevice,
    children: [
      { index: true, loader: () => redirect('/dashboard') },
      { path: '/dashboard', element: <DashboardPage /> },

      // Menu management
      { path: '/menu/products', element: <ProductsPage /> },
      { path: '/menu/products/:id', element: <ProductDetailPage /> },
      { path: '/menu/categories', element: <CategoriesPage /> },
      { path: '/menu/modifier-groups', element: <ModifierGroupsPage /> },
      { path: '/menu/menus', element: <MenusPage /> },
      { path: '/menu/menus/:id', element: <MenuDetailPage /> },

      // Orders
      { path: '/orders', element: <OrdersPage /> },
      { path: '/orders/:id', element: <OrderDetailPage /> },

      // Inventory
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/inventory/purchase-orders', element: <PurchaseOrdersPage /> },
      { path: '/inventory/purchase-orders/:id', element: <PurchaseOrderDetailPage /> },
      { path: '/inventory/vendors', element: <VendorsPage /> },

      // Employees
      { path: '/employees', element: <EmployeesPage /> },
      { path: '/employees/:id', element: <EmployeeDetailPage /> },
      { path: '/employees/schedules', element: <SchedulesPage /> },
      { path: '/employees/timesheets', element: <TimesheetsPage /> },

      // Customers / CRM
      { path: '/customers', element: <CustomersPage /> },
      { path: '/customers/:id', element: <CustomerDetailPage /> },
      { path: '/customers/loyalty', element: <LoyaltyPage /> },
      { path: '/customers/gift-cards', element: <GiftCardsPage /> },
      { path: '/customers/campaigns', element: <CampaignsPage /> },

      // Promotions
      { path: '/promotions/discounts', element: <DiscountsPage /> },

      // Payments
      { path: '/payments', element: <PaymentsPage /> },
      { path: '/payments/:id', element: <PaymentDetailPage /> },

      // Reports
      { path: '/reports', element: <ReportsPage /> },
      { path: '/reports/sales', element: <SalesReportPage /> },
      { path: '/reports/labor', element: <LaborReportPage /> },
      { path: '/reports/product-mix', element: <ProductMixReportPage /> },
      { path: '/reports/inventory', element: <InventoryReportPage /> },

      // Accounting
      { path: '/accounting', element: <AccountingPage /> },

      // Settings
      { path: '/settings/devices', element: <DevicesPage /> },
      { path: '/settings/api-keys', element: <ApiKeysPage /> },
      { path: '/settings/webhooks', element: <WebhooksPage /> },
      { path: '/settings/locations', element: <LocationsPage /> },
      { path: '/settings/taxes', element: <TaxesPage /> },
    ],
  },
])
