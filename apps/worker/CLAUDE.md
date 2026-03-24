# @orderstack/worker

BullMQ background job workers — handles all async processing for the OrderStack platform.

## Purpose

Offloads heavy or time-consuming operations from the API so HTTP responses stay fast.
All jobs are triggered by the API adding to a Redis queue; workers process them independently.

## Key Files

- `src/main.ts` — registers all workers, handles SIGTERM gracefully
- `src/jobs/loyalty-expiry.job.ts` — nightly: expires points for inactive loyalty accounts
- `src/jobs/analytics-materialization.job.ts` — nightly: materializes analytics fact tables
- `src/jobs/gl-export.job.ts` — generates GL export files, uploads to R2
- `src/jobs/report-export.job.ts` — generates report CSV/PDF files, uploads to R2
- `src/jobs/email-campaign.job.ts` — sends email campaigns via Resend
- `src/jobs/sms-campaign.job.ts` — sends SMS campaigns via Twilio
- `src/jobs/webhook-delivery.job.ts` — delivers webhook events with HMAC-SHA256 signing + retry

## Queue Names

```
gl-export
loyalty-expiry
analytics-materialization
email-campaign
sms-campaign
webhook-delivery
report-export
```

## Scheduled Jobs

Repeatable jobs are registered via BullMQ's repeat mechanism:
- `loyalty-expiry` — cron: `0 2 * * *` (2am daily)
- `analytics-materialization` — cron: `0 3 * * *` (3am daily)

## Error Handling

All jobs throw on failure — BullMQ handles retry with exponential backoff.
Webhook delivery has its own retry logic (up to 72 hours).
Failed jobs are logged and sent to Sentry.

## Running

```bash
pnpm dev     # tsx watch src/main.ts
pnpm build   # compile to dist/
pnpm start   # run compiled
```

## Dependencies

- `@orderstack/db` — database access
- `bullmq` — job queue
- `ioredis` — Redis connection
- `resend` — email sending
- Twilio via fetch API
