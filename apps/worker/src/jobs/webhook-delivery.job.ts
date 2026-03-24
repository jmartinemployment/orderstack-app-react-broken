import type { Job } from 'bullmq'
import { createHmac } from 'node:crypto'
import { db } from '@orderstack/db'
import { webhookDeliveries, webhookEndpoints } from '@orderstack/db/schema'
import { eq } from 'drizzle-orm'

export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery'

interface WebhookDeliveryPayload {
  deliveryId: string
  endpointId: string
  eventType: string
  payload: Record<string, unknown>
}

/**
 * Delivers a webhook event to the registered endpoint URL.
 *
 * Signs the payload with HMAC-SHA256 using the endpoint's secret.
 * Retries with exponential backoff (up to 72 hours, max 10 attempts).
 *
 * The job is created by the API whenever a business event occurs
 * (order.created, payment.completed, etc.).
 */
export async function webhookDeliveryJob(job: Job<WebhookDeliveryPayload>): Promise<void> {
  const { deliveryId, endpointId, eventType, payload } = job.data

  // Get endpoint and its secret
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .limit(1)

  if (!endpoint || !endpoint.isActive) {
    await db
      .update(webhookDeliveries)
      .set({ status: 'failed' })
      .where(eq(webhookDeliveries.id, deliveryId))
    return
  }

  const body = JSON.stringify({
    id: deliveryId,
    type: eventType,
    createdAt: new Date().toISOString(),
    data: payload,
  })

  // Sign with HMAC-SHA256
  const signature = createHmac('sha256', endpoint.secretHash)
    .update(body)
    .digest('hex')

  let httpStatus: number
  let responseBody: string

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OrderStack-Signature': `sha256=${signature}`,
        'X-OrderStack-Event': eventType,
        'X-OrderStack-Delivery': deliveryId,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    })

    httpStatus = response.status
    const text = await response.text()
    responseBody = text.slice(0, 2048)

    const succeeded = response.status >= 200 && response.status < 300

    await db
      .update(webhookDeliveries)
      .set({
        status: succeeded ? 'succeeded' : 'failed',
        httpStatus,
        responseBody,
        attemptCount: (job.attemptsMade ?? 0) + 1,
        deliveredAt: succeeded ? new Date() : null,
        nextRetryAt: succeeded ? null : computeNextRetry(job.attemptsMade ?? 0),
      })
      .where(eq(webhookDeliveries.id, deliveryId))

    if (!succeeded) {
      throw new Error(`Endpoint returned ${httpStatus}`)
    }
  } catch (err) {
    await db
      .update(webhookDeliveries)
      .set({
        status: 'retrying',
        attemptCount: (job.attemptsMade ?? 0) + 1,
        nextRetryAt: computeNextRetry(job.attemptsMade ?? 0),
      })
      .where(eq(webhookDeliveries.id, deliveryId))

    throw err
  }
}

/**
 * Exponential backoff: 1m, 5m, 30m, 2h, 12h, 24h, 48h, 72h
 * After 72 hours, no more retries.
 */
function computeNextRetry(attempt: number): Date | null {
  const delays = [60, 300, 1800, 7200, 43200, 86400, 172800, 259200]
  const delaySeconds = delays[attempt]
  if (!delaySeconds) return null
  return new Date(Date.now() + delaySeconds * 1000)
}
