import { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { glExportJob, GL_EXPORT_QUEUE } from './jobs/gl-export.job.js'
import { loyaltyExpiryJob, LOYALTY_EXPIRY_QUEUE } from './jobs/loyalty-expiry.job.js'
import { analyticsJob, ANALYTICS_QUEUE } from './jobs/analytics-materialization.job.js'
import { emailCampaignJob, EMAIL_CAMPAIGN_QUEUE } from './jobs/email-campaign.job.js'
import { smsCampaignJob, SMS_CAMPAIGN_QUEUE } from './jobs/sms-campaign.job.js'
import { webhookDeliveryJob, WEBHOOK_DELIVERY_QUEUE } from './jobs/webhook-delivery.job.js'
import { reportExportJob, REPORT_EXPORT_QUEUE } from './jobs/report-export.job.js'

const connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const workers = [
  new Worker(GL_EXPORT_QUEUE, glExportJob, { connection }),
  new Worker(LOYALTY_EXPIRY_QUEUE, loyaltyExpiryJob, { connection }),
  new Worker(ANALYTICS_QUEUE, analyticsJob, { connection }),
  new Worker(EMAIL_CAMPAIGN_QUEUE, emailCampaignJob, { connection }),
  new Worker(SMS_CAMPAIGN_QUEUE, smsCampaignJob, { connection }),
  new Worker(WEBHOOK_DELIVERY_QUEUE, webhookDeliveryJob, { connection }),
  new Worker(REPORT_EXPORT_QUEUE, reportExportJob, { connection }),
]

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, err)
  })

  worker.on('completed', (job) => {
    console.log(`[${worker.name}] Job ${job.id} completed`)
  })
}

console.log(`OrderStack Worker started — ${workers.length} queues active`)

process.on('SIGTERM', async () => {
  console.log('Shutting down workers...')
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
})
