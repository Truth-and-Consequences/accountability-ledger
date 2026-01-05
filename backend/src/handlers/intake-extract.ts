import type { ScheduledEvent, Context } from 'aws-lambda';
import type { IntakeItem, ExtractionStatus } from '@ledger/shared';
import { logger } from '../lib/logger.js';
import { config } from '../lib/config.js';
import { listIntakeByStatus, updateIntakeItem } from '../lib/services/intake.js';
import { extractFromIntakeItem } from '../lib/services/extraction.js';

/**
 * Lambda handler for LLM-based entity and relationship extraction.
 * Triggered by EventBridge on a schedule (30 min after ingestion).
 * Processes NEW intake items that haven't been extracted yet.
 */
export async function handler(event: ScheduledEvent, context: Context): Promise<void> {
  const requestId = context.awsRequestId;

  logger.info(
    {
      requestId,
      eventSource: event.source,
      eventTime: event.time,
    },
    'Starting intake extraction run'
  );

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Get NEW items that haven't been processed yet
    let cursor: Record<string, unknown> | undefined;

    do {
      const result = await listIntakeByStatus('NEW', 20, cursor);

      for (const item of result.items) {
        // Skip if already extracted
        if (item.extractionStatus === 'COMPLETED' || item.extractionStatus === 'SKIPPED') {
          skipped++;
          continue;
        }

        // Check max items limit
        if (processed >= config.extraction.maxItemsPerRun) {
          logger.info(
            { processed, maxItems: config.extraction.maxItemsPerRun },
            'Reached max items limit for this run'
          );
          break;
        }

        processed++;

        try {
          await processItem(item);
          succeeded++;
        } catch (error) {
          failed++;
          logger.error(
            {
              intakeId: item.intakeId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to extract from item'
          );

          // Mark as failed to avoid reprocessing
          await markExtractionFailed(item, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      cursor = result.lastEvaluatedKey;
    } while (cursor && processed < config.extraction.maxItemsPerRun);

    logger.info(
      {
        requestId,
        processed,
        succeeded,
        failed,
        skipped,
      },
      'Completed intake extraction run'
    );
  } catch (error) {
    logger.error(
      {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Fatal error in extraction run'
    );

    // Re-throw to mark Lambda invocation as failed
    throw error;
  }
}

/**
 * Process a single intake item for extraction.
 */
async function processItem(item: IntakeItem): Promise<void> {
  logger.info(
    { intakeId: item.intakeId, title: item.title },
    'Processing item for extraction'
  );

  // Skip items with no summary (title-only extraction is low quality)
  if (!item.summary || item.summary.length < 50) {
    logger.info(
      { intakeId: item.intakeId, summaryLength: item.summary?.length || 0 },
      'Skipping item with insufficient content'
    );
    await updateIntakeItem(item, {
      extractionStatus: 'SKIPPED' as ExtractionStatus,
      extractedAt: new Date().toISOString(),
    });
    return;
  }

  const { summary, entities, relationships, sources } = await extractFromIntakeItem(item);

  logger.info(
    {
      intakeId: item.intakeId,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      sourceCount: sources.length,
      matchedEntities: entities.filter((e) => e.matchedEntityId).length,
      hasSummary: !!summary,
    },
    'Extraction completed for item'
  );

  await updateIntakeItem(item, {
    extractedSummary: summary,
    suggestedEntities: entities,
    suggestedRelationships: relationships,
    suggestedSources: sources,
    extractionStatus: 'COMPLETED' as ExtractionStatus,
    extractedAt: new Date().toISOString(),
  });
}

/**
 * Mark an item as failed extraction.
 */
async function markExtractionFailed(item: IntakeItem, errorMessage: string): Promise<void> {
  await updateIntakeItem(item, {
    extractionStatus: 'FAILED' as ExtractionStatus,
    extractionError: errorMessage.slice(0, 500), // Limit error message length
    extractedAt: new Date().toISOString(),
  });
}
