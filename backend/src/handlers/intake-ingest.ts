import type { ScheduledEvent, Context } from 'aws-lambda';
import { logger } from '../lib/logger.js';
import { runIntakeIngestion } from '../lib/services/intake.js';

/**
 * Lambda handler for scheduled RSS ingestion
 * Triggered by EventBridge on a daily schedule
 */
export async function handler(event: ScheduledEvent, context: Context): Promise<void> {
  const requestId = context.awsRequestId;

  logger.info(
    {
      requestId,
      eventSource: event.source,
      eventTime: event.time,
    },
    'Starting scheduled intake ingestion'
  );

  try {
    const summary = await runIntakeIngestion();

    logger.info(
      {
        requestId,
        runId: summary.runId,
        totalIngested: summary.totalIngested,
        totalSkipped: summary.totalSkipped,
        feedResults: summary.feedResults.map((r) => ({
          feedId: r.feedId,
          ingested: r.itemsIngested,
          skipped: r.itemsSkipped,
          errors: r.errors.length,
        })),
      },
      'Completed scheduled intake ingestion'
    );

    // Log any errors at warning level
    for (const result of summary.feedResults) {
      if (result.errors.length > 0) {
        logger.warn(
          {
            feedId: result.feedId,
            errors: result.errors,
          },
          'Feed ingestion had errors'
        );
      }
    }
  } catch (error) {
    logger.error(
      {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to run intake ingestion'
    );

    // Re-throw to mark Lambda invocation as failed
    throw error;
  }
}