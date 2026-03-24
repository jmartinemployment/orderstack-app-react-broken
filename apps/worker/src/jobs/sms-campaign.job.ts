import type { Job } from 'bullmq'
import { withTenantSchema } from '@orderstack/db'
import { campaigns, campaignRecipients, campaignStats, customers } from '@orderstack/db/schema'
import { eq, and } from 'drizzle-orm'

export const SMS_CAMPAIGN_QUEUE = 'sms-campaign'

interface SmsCampaignPayload {
  campaignId: string
  tenantId: string
}

/**
 * Sends an SMS campaign via Twilio to all pending recipients.
 * Processes in batches of 20 (Twilio rate limit consideration).
 */
export async function smsCampaignJob(job: Job<SmsCampaignPayload>): Promise<void> {
  const accountSid = process.env['TWILIO_ACCOUNT_SID']
  const authToken = process.env['TWILIO_AUTH_TOKEN']
  const fromPhone = process.env['TWILIO_PHONE_NUMBER']

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error('Twilio credentials not configured')
  }

  const { campaignId, tenantId } = job.data

  await withTenantSchema(tenantId, async (tenantDb) => {
    const [campaign] = await tenantDb
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1)

    if (!campaign || campaign.channel !== 'sms') {
      throw new Error(`Campaign ${campaignId} not found or not an SMS campaign`)
    }

    const pendingRecipients = await tenantDb
      .select({
        id: campaignRecipients.id,
        customerId: campaignRecipients.customerId,
        phone: customers.phone,
        firstName: customers.firstName,
      })
      .from(campaignRecipients)
      .innerJoin(customers, eq(customers.id, campaignRecipients.customerId))
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'pending'),
        ),
      )

    const BATCH_SIZE = 20
    let sentCount = 0
    let failedCount = 0

    for (let i = 0; i < pendingRecipients.length; i += BATCH_SIZE) {
      const batch = pendingRecipients.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(
        batch.map(async (recipient) => {
          if (!recipient.phone) {
            await tenantDb
              .update(campaignRecipients)
              .set({ status: 'failed' })
              .where(eq(campaignRecipients.id, recipient.id))
            failedCount++
            return
          }

          try {
            const body = campaign.body.replace(/\{\{firstName\}\}/g, recipient.firstName)

            const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
            const response = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${credentials}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  From: fromPhone,
                  To: recipient.phone,
                  Body: body,
                }).toString(),
              },
            )

            if (!response.ok) {
              throw new Error(`Twilio error: ${response.status}`)
            }

            await tenantDb
              .update(campaignRecipients)
              .set({ status: 'sent', sentAt: new Date() })
              .where(eq(campaignRecipients.id, recipient.id))

            sentCount++
          } catch {
            await tenantDb
              .update(campaignRecipients)
              .set({ status: 'failed' })
              .where(eq(campaignRecipients.id, recipient.id))
            failedCount++
          }
        }),
      )

      // Respect Twilio rate limits
      await new Promise((resolve) => setTimeout(resolve, 500))

      await job.updateProgress({
        processed: i + batch.length,
        total: pendingRecipients.length,
      })
    }

    await tenantDb
      .update(campaignStats)
      .set({ sentCount, failedCount, updatedAt: new Date() })
      .where(eq(campaignStats.campaignId, campaignId))

    await tenantDb
      .update(campaigns)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(campaigns.id, campaignId))
  })
}
