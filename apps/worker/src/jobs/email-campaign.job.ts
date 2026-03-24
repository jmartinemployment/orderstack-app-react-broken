import type { Job } from 'bullmq'
import { Resend } from 'resend'
import { withTenantSchema, db } from '@orderstack/db'
import { campaigns, campaignRecipients, campaignStats, customers } from '@orderstack/db/schema'
import { eq, and } from 'drizzle-orm'

export const EMAIL_CAMPAIGN_QUEUE = 'email-campaign'

interface EmailCampaignPayload {
  campaignId: string
  tenantId: string
}

const resend = new Resend(process.env['RESEND_API_KEY'])

/**
 * Sends an email campaign to all pending recipients.
 * Processes recipients in batches of 50 to avoid rate limits.
 * Updates campaign_stats and recipient status after each batch.
 */
export async function emailCampaignJob(job: Job<EmailCampaignPayload>): Promise<void> {
  const { campaignId, tenantId } = job.data

  await withTenantSchema(tenantId, async (tenantDb) => {
    const [campaign] = await tenantDb
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1)

    if (!campaign || campaign.channel !== 'email') {
      throw new Error(`Campaign ${campaignId} not found or not an email campaign`)
    }

    const pendingRecipients = await tenantDb
      .select({
        id: campaignRecipients.id,
        customerId: campaignRecipients.customerId,
        email: customers.email,
        firstName: customers.firstName,
        lastName: customers.lastName,
      })
      .from(campaignRecipients)
      .innerJoin(customers, eq(customers.id, campaignRecipients.customerId))
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'pending'),
        ),
      )

    const BATCH_SIZE = 50
    let sentCount = 0
    let failedCount = 0

    for (let i = 0; i < pendingRecipients.length; i += BATCH_SIZE) {
      const batch = pendingRecipients.slice(i, i + BATCH_SIZE)

      await Promise.allSettled(
        batch.map(async (recipient) => {
          if (!recipient.email) {
            await tenantDb
              .update(campaignRecipients)
              .set({ status: 'failed' })
              .where(eq(campaignRecipients.id, recipient.id))
            failedCount++
            return
          }

          try {
            const personalizedBody = campaign.body
              .replace(/\{\{firstName\}\}/g, recipient.firstName)
              .replace(/\{\{lastName\}\}/g, recipient.lastName)

            await resend.emails.send({
              from: `${process.env['RESEND_FROM_NAME'] ?? 'OrderStack'} <${process.env['RESEND_FROM_EMAIL'] ?? 'noreply@orderstack.io'}>`,
              to: recipient.email,
              subject: campaign.subject ?? campaign.name,
              html: personalizedBody,
            })

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

      await job.updateProgress({
        processed: i + batch.length,
        total: pendingRecipients.length,
        sentCount,
        failedCount,
      })
    }

    // Update campaign stats
    await tenantDb
      .update(campaignStats)
      .set({
        sentCount,
        failedCount,
        updatedAt: new Date(),
      })
      .where(eq(campaignStats.campaignId, campaignId))

    // Mark campaign as sent
    await tenantDb
      .update(campaigns)
      .set({ status: 'sent', sentAt: new Date() })
      .where(eq(campaigns.id, campaignId))
  })
}
