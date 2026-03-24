import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from './config/env.js'
import { authPlugin } from './plugins/auth.js'
import { multitenancyPlugin } from './plugins/multitenancy.js'
import { devicePlugin } from './plugins/device.js'
import { auditPlugin } from './plugins/audit.js'
import { authRoutes } from './routes/auth.routes.js'
import { devicesRoutes } from './routes/devices.routes.js'
import { tenantsRoutes } from './routes/tenants.routes.js'
import { locationsRoutes } from './routes/locations.routes.js'
import { productsRoutes } from './routes/products.routes.js'
import { categoriesRoutes } from './routes/categories.routes.js'
import { modifierGroupsRoutes } from './routes/modifier-groups.routes.js'
import { menusRoutes } from './routes/menus.routes.js'
import { ordersRoutes } from './routes/orders.routes.js'
import { paymentsRoutes } from './routes/payments.routes.js'
import { inventoryRoutes } from './routes/inventory.routes.js'
import { purchaseOrdersRoutes } from './routes/purchase-orders.routes.js'
import { vendorsRoutes } from './routes/vendors.routes.js'
import { employeesRoutes } from './routes/employees.routes.js'
import { schedulesRoutes } from './routes/schedules.routes.js'
import { customersRoutes } from './routes/customers.routes.js'
import { loyaltyRoutes } from './routes/loyalty.routes.js'
import { giftCardsRoutes } from './routes/gift-cards.routes.js'
import { discountsRoutes } from './routes/discounts.routes.js'
import { reportsRoutes } from './routes/reports.routes.js'
import { accountingRoutes } from './routes/accounting.routes.js'
import { webhooksRoutes } from './routes/webhooks.routes.js'
import { apiKeysRoutes } from './routes/api-keys.routes.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // ─── Security ───────────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(rateLimit, {
    global: true,
    max: 1000,
    timeWindow: '1 minute',
    redis: undefined, // will be wired when Redis plugin is added
    keyGenerator: (request) =>
      (request.headers['x-api-key'] as string) ?? request.ip,
  })

  await app.register(cookie)

  // ─── OpenAPI Docs ────────────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OrderStack API',
        version: '1.0.0',
        description: 'OrderStack Back Office Administration API',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  })

  // ─── Plugins ─────────────────────────────────────────────────────────────────
  await app.register(authPlugin)
  await app.register(multitenancyPlugin)
  await app.register(devicePlugin)
  await app.register(auditPlugin)

  // ─── Health Check ────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '0.0.0',
    timestamp: new Date().toISOString(),
  }))

  // ─── Routes ──────────────────────────────────────────────────────────────────
  const V1 = '/v1'

  await app.register(authRoutes, { prefix: `${V1}/auth` })
  await app.register(devicesRoutes, { prefix: `${V1}/devices` })
  await app.register(tenantsRoutes, { prefix: `${V1}/tenants` })
  await app.register(locationsRoutes, { prefix: `${V1}/locations` })
  await app.register(productsRoutes, { prefix: `${V1}/products` })
  await app.register(categoriesRoutes, { prefix: `${V1}/categories` })
  await app.register(modifierGroupsRoutes, { prefix: `${V1}/modifier-groups` })
  await app.register(menusRoutes, { prefix: `${V1}/menus` })
  await app.register(ordersRoutes, { prefix: `${V1}/orders` })
  await app.register(paymentsRoutes, { prefix: `${V1}/payments` })
  await app.register(inventoryRoutes, { prefix: `${V1}/inventory` })
  await app.register(purchaseOrdersRoutes, { prefix: `${V1}/purchase-orders` })
  await app.register(vendorsRoutes, { prefix: `${V1}/vendors` })
  await app.register(employeesRoutes, { prefix: `${V1}/employees` })
  await app.register(schedulesRoutes, { prefix: `${V1}/schedules` })
  await app.register(customersRoutes, { prefix: `${V1}/customers` })
  await app.register(loyaltyRoutes, { prefix: `${V1}/loyalty` })
  await app.register(giftCardsRoutes, { prefix: `${V1}/gift-cards` })
  await app.register(discountsRoutes, { prefix: `${V1}/discounts` })
  await app.register(reportsRoutes, { prefix: `${V1}/reports` })
  await app.register(accountingRoutes, { prefix: `${V1}/accounting` })
  await app.register(webhooksRoutes, { prefix: `${V1}/webhooks` })
  await app.register(apiKeysRoutes, { prefix: `${V1}/api-keys` })

  return app
}
