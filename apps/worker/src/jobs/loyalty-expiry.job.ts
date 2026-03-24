import type { Job } from 'bullmq'
import { db, withTenantSchema } from '@orderstack/db'
import { loyaltyAccounts, loyaltyTransactions, loyaltyPrograms } from '@orderstack/db/schema'
import { eq, and, lt, sql, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export const LOYALTY_EXPIRY_QUEUE = 'loyalty-expiry'

/**
 * Nightly job that expires points for inactive loyalty accounts.
 *
 * For each tenant, queries loyalty_accounts WHERE:
 *   - pointsBalance > 0
 *   - The linked program has expiryDays set
 *   - lastActivityAt < now() - interval '{expiryDays} days'
 *
 * Creates a loyalty_transaction row with transactionType='expire'
 * and zeroes the account's pointsBalance.
 *
 * Scheduled via a BullMQ repeatable job (cron: '0 2 * * *' — 2am daily).
 */
export async function loyaltyExpiryJob(job: Job<{ tenantId: string }>): Promise<void> {
  const { tenantId } = job.data

  await withTenantSchema(tenantId, async (tenantDb) => {
    // Find all programs with expiry configured
    const programs = await tenantDb
      .select()
      .from(loyaltyPrograms)
      .where(and(eq(loyaltyPrograms.isActive, true), sql`${loyaltyPrograms.expiryDays} IS NOT NULL`))

    for (const program of programs) {
      if (!program.expiryDays) continue

      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - program.expiryDays)

      // Find accounts with expired points
      const expiredAccounts = await tenantDb
        .select()
        .from(loyaltyAccounts)
        .where(
          and(
            eq(loyaltyAccounts.programId, program.id),
            gt(loyaltyAccounts.pointsBalance, '0'),
            lt(loyaltyAccounts.lastActivityAt, cutoffDate),
          ),
        )

      for (const account of expiredAccounts) {
        const expiredPoints = account.pointsBalance

        await tenantDb.transaction(async (tx) => {
          // Zero the balance
          await tx
            .update(loyaltyAccounts)
            .set({ pointsBalance: '0' })
            .where(eq(loyaltyAccounts.id, account.id))

          // Record the expiry transaction
          await tx.insert(loyaltyTransactions).values({
            id: nanoid(),
            loyaltyAccountId: account.id,
            transactionType: 'expire',
            pointsDelta: `-${expiredPoints}`,
            notes: `Points expired after ${program.expiryDays} days of inactivity`,
            createdAt: new Date(),
          })
        })

        await job.updateProgress({
          accountId: account.id,
          expiredPoints,
        })
      }
    }
  })
}
