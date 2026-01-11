/**
 * Intake Editor Lambda Handler
 *
 * Autonomous LLM editor that reviews intake items and publishes
 * cards to the public feed. Runs on a schedule via EventBridge.
 */

import type { ScheduledEvent, Context } from 'aws-lambda';
import { logger } from '../lib/logger.js';
import { runEditor } from '../lib/services/editor.js';

const editorLogger = logger.child({ handler: 'intake-editor' });

export async function handler(event: ScheduledEvent, context: Context): Promise<void> {
  const requestId = context.awsRequestId;

  editorLogger.info(
    {
      requestId,
      source: event.source,
      time: event.time,
    },
    'Starting intake editor run'
  );

  try {
    const summary = await runEditor();

    editorLogger.info(
      {
        requestId,
        runId: summary.runId,
        processed: summary.processed,
        published: summary.published,
        skipped: summary.skipped,
        errors: summary.errors,
        dryRun: summary.dryRun,
      },
      'Completed intake editor run'
    );

    // Log individual results at debug level
    for (const result of summary.results) {
      editorLogger.debug(
        {
          intakeId: result.intakeId,
          decision: result.decision,
          reason: result.reason,
          cardId: result.cardId,
        },
        'Item result'
      );
    }

    // If there were errors, throw to mark Lambda invocation as failed
    // This will trigger CloudWatch alarms if configured
    if (summary.errors > 0 && summary.errors === summary.processed) {
      throw new Error(`All ${summary.errors} items failed processing`);
    }
  } catch (error) {
    editorLogger.error(
      {
        requestId,
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
      'Editor run failed'
    );
    throw error;
  }
}
