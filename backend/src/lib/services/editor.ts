/**
 * LLM Editor Service
 *
 * Autonomous editor that reviews intake items and makes publish decisions.
 * Uses Claude to evaluate items and decide whether to publish them.
 */

import { ulid } from 'ulid';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import type {
  IntakeItem,
  SuggestedEntity,
  EntityType,
  RelationshipType,
  CardCategory,
} from '@ledger/shared';
import { CardCategory as CardCategoryEnum } from '@ledger/shared';
import { config } from '../config.js';
import { invokeClaudeExtraction } from '../anthropic.js';
import { logger } from '../logger.js';
import { queryItems, putItem, stripKeys, scanItems } from '../dynamodb.js';
import { createEntity, getEntity, findEntityByName } from './entities.js';
import { createSource, captureHtmlSnapshot } from './sources.js';
import { createCard, publishCard, listCards } from './cards.js';
import { createRelationship, publishRelationship } from './relationships.js';
import { logAuditEvent } from './audit.js';

// Create child logger for editor
const editorLogger = logger.child({ service: 'editor' });

// Editor decision type (local, matches shared/intake.ts EditorDecision)
interface EditorDecision {
  decision: 'PUBLISH' | 'SKIP';
  reason: string;
  confidence: number;
  decidedAt: string;
  runId: string;
}
const s3Client = new S3Client({ region: config.region });

const INTAKE_TABLE = config.tables.intake;
const EDITOR_USER_ID = 'llm-editor';

// Cache for prompt template
let cachedEditorPrompt: string | null = null;

/**
 * Editor decision from Claude
 */
export interface EditorResponse {
  decision: 'PUBLISH' | 'SKIP';
  reason: string;
  confidence: number;
  category?: string;
  entities: Array<
    | { matchedIndex: number }
    | { entityId: string }
    | { create: { name: string; type: string } }
  >;
  relationships: Array<{
    fromEntityIndex: number;
    toEntityIndex: number;
    type: string;
    description?: string;
  }>;
  cardSummary: string;
}

/**
 * Result of processing a single intake item
 */
export interface EditorItemResult {
  intakeId: string;
  decision: 'PUBLISH' | 'SKIP' | 'ERROR';
  reason: string;
  cardId?: string;
  entityIds?: string[];
  relationshipIds?: string[];
}

/**
 * Summary of an editor run
 */
export interface EditorRunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  processed: number;
  published: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  results: EditorItemResult[];
}

/**
 * Load the editor prompt template from S3
 */
async function loadEditorPrompt(): Promise<string> {
  if (cachedEditorPrompt) {
    return cachedEditorPrompt;
  }

  const bucket = config.extraction.promptTemplateBucket;
  const key = config.editor.promptTemplateKey;

  if (!bucket) {
    throw new Error('EXTRACTION_PROMPT_BUCKET environment variable is not set');
  }

  editorLogger.info({ bucket, key }, 'Loading editor prompt template from S3');

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);
  const template = await response.Body?.transformToString();

  if (!template) {
    throw new Error(`Failed to load editor prompt from s3://${bucket}/${key}`);
  }

  cachedEditorPrompt = template;
  editorLogger.info('Successfully loaded editor prompt template from S3');

  return cachedEditorPrompt;
}

/**
 * Build the editor prompt for a specific intake item
 */
function buildEditorPrompt(
  template: string,
  item: IntakeItem,
  matchedEntities: Array<{ entityId: string; name: string; type: string }>
): string {
  const entitiesJson = JSON.stringify(item.suggestedEntities || [], null, 2);
  const relationshipsJson = JSON.stringify(item.suggestedRelationships || [], null, 2);
  const matchedJson = JSON.stringify(matchedEntities, null, 2);

  return template
    .replace('{{TITLE}}', item.title)
    .replace('{{PUBLISHER}}', item.publisher)
    .replace('{{PUBLISHED_AT}}', item.publishedAt)
    .replace('{{URL}}', item.canonicalUrl)
    .replace('{{EXTRACTED_SUMMARY}}', item.extractedSummary || item.summary || '')
    .replace('{{ENTITIES_JSON}}', entitiesJson)
    .replace('{{RELATIONSHIPS_JSON}}', relationshipsJson)
    .replace('{{MATCHED_ENTITIES_JSON}}', matchedJson);
}

/**
 * Parse the editor response from Claude
 */
function parseEditorResponse(content: string): EditorResponse | null {
  try {
    // Remove markdown code blocks if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Find JSON object
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) {
      editorLogger.warn({ content: content.substring(0, 200) }, 'No JSON object found in editor response');
      return null;
    }

    const parsed = JSON.parse(match[0]);

    // Validate required fields
    if (!parsed.decision || !['PUBLISH', 'SKIP'].includes(parsed.decision)) {
      editorLogger.warn({ parsed }, 'Invalid decision in editor response');
      return null;
    }

    return {
      decision: parsed.decision,
      reason: parsed.reason || 'No reason provided',
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
      category: parsed.category,
      entities: parsed.entities || [],
      relationships: parsed.relationships || [],
      cardSummary: parsed.cardSummary || '',
    };
  } catch (error) {
    editorLogger.warn({ error: (error as Error).message }, 'Failed to parse editor response');
    return null;
  }
}

/**
 * Check if a similar card already exists
 */
async function checkForDuplicate(
  title: string,
  entityIds: string[]
): Promise<boolean> {
  // Get recent cards and check for title similarity
  const { items: recentCards } = await listCards({ limit: 100 }, true);

  const normalizedTitle = title.toLowerCase().trim();

  for (const card of recentCards) {
    const cardTitle = card.title.toLowerCase().trim();

    // Check for exact or very similar title
    if (cardTitle === normalizedTitle) {
      editorLogger.info({ existingCardId: card.cardId, title }, 'Found duplicate card by title');
      return true;
    }

    // Check if same entity and similar title (first 50 chars)
    const hasOverlappingEntity = card.entityIds.some((id) => entityIds.includes(id));
    if (hasOverlappingEntity && cardTitle.substring(0, 50) === normalizedTitle.substring(0, 50)) {
      editorLogger.info({ existingCardId: card.cardId, title }, 'Found duplicate card by entity+title prefix');
      return true;
    }
  }

  return false;
}

/**
 * Get matched entities from database for an intake item's suggestions
 * If matchedEntityId exists, use it. Otherwise, try to find by name.
 */
async function getMatchedEntities(
  suggestions: SuggestedEntity[]
): Promise<Array<{ entityId: string; name: string; type: string }>> {
  const matched: Array<{ entityId: string; name: string; type: string }> = [];
  const seenIds = new Set<string>();

  for (const suggestion of suggestions) {
    let entity = null;

    // First try the pre-matched ID
    if (suggestion.matchedEntityId) {
      try {
        entity = await getEntity(suggestion.matchedEntityId);
      } catch {
        // Entity no longer exists
      }
    }

    // If no pre-matched entity, try to find by name
    if (!entity && suggestion.extractedName) {
      entity = await findEntityByName(suggestion.extractedName);
    }

    // Add to matched list if found and not already seen
    if (entity && !seenIds.has(entity.entityId)) {
      seenIds.add(entity.entityId);
      matched.push({
        entityId: entity.entityId,
        name: entity.name,
        type: entity.type,
      });
    }
  }

  return matched;
}

/**
 * Process a single intake item through the editor
 */
async function processItem(
  item: IntakeItem,
  template: string,
  runId: string,
  dryRun: boolean
): Promise<EditorItemResult> {
  const { intakeId } = item;

  try {
    // Get matched entities for context
    const matchedEntities = await getMatchedEntities(item.suggestedEntities || []);

    // Build and execute editor prompt
    const prompt = buildEditorPrompt(template, item, matchedEntities);
    const response = await invokeClaudeExtraction({
      prompt,
      maxTokens: 2048,
      temperature: 0,
    });

    editorLogger.debug(
      { intakeId, inputTokens: response.inputTokens, outputTokens: response.outputTokens },
      'Editor Claude call completed'
    );

    // Parse the response
    const editorResponse = parseEditorResponse(response.content);
    if (!editorResponse) {
      return {
        intakeId,
        decision: 'ERROR',
        reason: 'Failed to parse editor response',
      };
    }

    // Record the decision
    const decision: EditorDecision = {
      decision: editorResponse.decision,
      reason: editorResponse.reason,
      confidence: editorResponse.confidence,
      decidedAt: new Date().toISOString(),
      runId,
    };

    // Check confidence threshold
    if (editorResponse.decision === 'PUBLISH' && editorResponse.confidence < config.editor.minConfidence) {
      editorLogger.info(
        { intakeId, confidence: editorResponse.confidence, threshold: config.editor.minConfidence },
        'Confidence below threshold, treating as SKIP'
      );
      editorResponse.decision = 'SKIP';
      editorResponse.reason = `Confidence ${editorResponse.confidence.toFixed(2)} below threshold ${config.editor.minConfidence}`;
      decision.decision = 'SKIP';
      decision.reason = editorResponse.reason;
    }

    // Handle SKIP decision
    if (editorResponse.decision === 'SKIP') {
      if (!dryRun) {
        await updateIntakeEditorStatus(intakeId, 'SKIPPED', decision);
      }
      return {
        intakeId,
        decision: 'SKIP',
        reason: editorResponse.reason,
      };
    }

    // PUBLISH decision - resolve entities
    const resolvedEntityIds: string[] = [];

    for (const entityRef of editorResponse.entities) {
      if ('matchedIndex' in entityRef) {
        // Use index to look up entity from the matched entities array
        const index = entityRef.matchedIndex;
        if (index >= 0 && index < matchedEntities.length) {
          const matched = matchedEntities[index];
          resolvedEntityIds.push(matched.entityId);
          editorLogger.debug({ entityId: matched.entityId, name: matched.name, index }, 'Using matched entity by index');
        } else {
          editorLogger.warn({ matchedIndex: index, matchedCount: matchedEntities.length }, 'Invalid matchedIndex, skipping');
        }
      } else if ('entityId' in entityRef) {
        // Legacy: Validate that the entity ID actually exists in the database
        const existingEntity = await getEntity(entityRef.entityId);
        if (existingEntity) {
          resolvedEntityIds.push(entityRef.entityId);
          editorLogger.debug({ entityId: entityRef.entityId, name: existingEntity.name }, 'Using existing entity by ID');
        } else {
          editorLogger.warn({ entityId: entityRef.entityId }, 'Entity ID not found in database, skipping');
        }
      } else if ('create' in entityRef && !dryRun) {
        // First check if entity with this name already exists
        const existingByName = await findEntityByName(entityRef.create.name);
        if (existingByName) {
          resolvedEntityIds.push(existingByName.entityId);
          editorLogger.info({ entityId: existingByName.entityId, name: existingByName.name }, 'Found existing entity by name');
          continue;
        }

        // Create new entity - map LLM types to valid EntityType values
        const typeMap: Record<string, EntityType> = {
          'CORPORATION': 'CORPORATION',
          'GOVERNMENT_AGENCY': 'AGENCY',
          'AGENCY': 'AGENCY',
          'INDIVIDUAL': 'PERSON',
          'PERSON': 'PERSON',
          'INDIVIDUAL_PUBLIC_OFFICIAL': 'INDIVIDUAL_PUBLIC_OFFICIAL',
          'NON_PROFIT': 'NONPROFIT',
          'NONPROFIT': 'NONPROFIT',
          'VENDOR': 'VENDOR',
          'POLITICAL_ENTITY': 'AGENCY',
          'OTHER': 'CORPORATION', // Default to corporation
        };
        const entityType = typeMap[entityRef.create.type.toUpperCase()] || 'CORPORATION';

        const entity = await createEntity(
          {
            name: entityRef.create.name,
            type: entityType,
            aliases: [],
          },
          EDITOR_USER_ID
        );
        resolvedEntityIds.push(entity.entityId);
        editorLogger.info({ entityId: entity.entityId, name: entity.name }, 'Created new entity');
      }
    }

    if (resolvedEntityIds.length === 0) {
      editorLogger.warn({ intakeId }, 'No entities resolved, skipping item');
      if (!dryRun) {
        await updateIntakeEditorStatus(intakeId, 'SKIPPED', {
          ...decision,
          decision: 'SKIP',
          reason: 'No entities could be resolved',
        });
      }
      return {
        intakeId,
        decision: 'SKIP',
        reason: 'No entities could be resolved',
      };
    }

    // Check for duplicates
    const isDuplicate = await checkForDuplicate(item.title, resolvedEntityIds);
    if (isDuplicate) {
      if (!dryRun) {
        await updateIntakeEditorStatus(intakeId, 'SKIPPED', {
          ...decision,
          decision: 'SKIP',
          reason: 'Duplicate card detected',
        });
      }
      return {
        intakeId,
        decision: 'SKIP',
        reason: 'Duplicate card detected',
      };
    }

    if (dryRun) {
      return {
        intakeId,
        decision: 'PUBLISH',
        reason: `[DRY RUN] Would publish with ${resolvedEntityIds.length} entities`,
        entityIds: resolvedEntityIds,
      };
    }

    // Create source
    const source = await createSource(
      {
        title: item.title,
        url: item.canonicalUrl,
        docType: 'HTML',
        publisher: item.publisher,
        excerpt: item.summary,
      },
      EDITOR_USER_ID
    );

    // Capture HTML snapshot (non-blocking)
    try {
      await captureHtmlSnapshot(source.sourceId, item.canonicalUrl, EDITOR_USER_ID);
    } catch (snapshotError) {
      editorLogger.warn(
        { sourceId: source.sourceId, error: (snapshotError as Error).message },
        'Failed to capture HTML snapshot, continuing anyway'
      );
    }

    // Determine category - validate LLM response or default to 'other'
    const validCategories: string[] = Object.values(CardCategoryEnum);
    const rawCategory = editorResponse.category?.toLowerCase();
    const category: CardCategory = rawCategory && validCategories.includes(rawCategory)
      ? rawCategory as CardCategory
      : 'other';

    // Create card
    const card = await createCard(
      {
        title: item.title,
        claim: item.title,
        summary: editorResponse.cardSummary || item.extractedSummary || item.summary || '',
        category,
        entityIds: resolvedEntityIds,
        eventDate: item.publishedAt.split('T')[0],
        sourceRefs: [source.sourceId],
        evidenceStrength: 'HIGH',
        tags: item.suggestedTags || [],
      },
      EDITOR_USER_ID
    );

    editorLogger.info({ cardId: card.cardId, intakeId }, 'Created card from intake');

    // Create relationships
    const relationshipIds: string[] = [];

    // Map LLM relationship types to valid RelationshipType values
    const relTypeMap: Record<string, RelationshipType> = {
      'OWNS': 'OWNS',
      'CONTROLS': 'CONTROLS',
      'SUBSIDIARY_OF': 'SUBSIDIARY_OF',
      'PARENT_OF': 'PARENT_OF',
      'AFFILIATED': 'AFFILIATED',
      'AFFILIATED_WITH': 'AFFILIATED',
      'CONTRACTOR_TO': 'CONTRACTOR_TO',
      'CONTRACTS_WITH': 'CONTRACTOR_TO',
      'REGULATED_BY': 'REGULATED_BY',
      'REGULATES': 'REGULATED_BY',
      'LOBBIED_BY': 'LOBBIED_BY',
      'LOBBIES': 'LOBBIED_BY',
      'ACQUIRED': 'ACQUIRED',
      'DIVESTED': 'DIVESTED',
      'JV_PARTNER': 'JV_PARTNER',
      'BOARD_INTERLOCK': 'BOARD_INTERLOCK',
      'FINED_BY': 'REGULATED_BY', // Map FINED_BY to REGULATED_BY
      'SUED_BY': 'OTHER',
      'SUED': 'OTHER',
      'SETTLED_WITH': 'OTHER',
      'INVESTIGATED_BY': 'REGULATED_BY',
      'OTHER': 'OTHER',
    };

    for (const relSpec of editorResponse.relationships) {
      const fromEntityId = resolvedEntityIds[relSpec.fromEntityIndex];
      const toEntityId = resolvedEntityIds[relSpec.toEntityIndex];

      if (fromEntityId && toEntityId) {
        try {
          const relType = relTypeMap[relSpec.type.toUpperCase()] || 'OTHER';

          const relationship = await createRelationship(
            {
              fromEntityId,
              toEntityId,
              type: relType,
              description: relSpec.description,
              sourceRefs: [source.sourceId],
            },
            EDITOR_USER_ID
          );
          relationshipIds.push(relationship.relationshipId);
        } catch (relError) {
          editorLogger.warn(
            { error: (relError as Error).message, fromEntityId, toEntityId },
            'Failed to create relationship'
          );
        }
      }
    }

    // Publish card
    try {
      await publishCard(card.cardId, EDITOR_USER_ID);
      editorLogger.info({ cardId: card.cardId }, 'Published card');
    } catch (publishError) {
      editorLogger.error(
        { error: (publishError as Error).message, cardId: card.cardId },
        'Failed to publish card'
      );
      // Card stays as DRAFT, user can review later
    }

    // Publish relationships
    for (const relId of relationshipIds) {
      try {
        await publishRelationship(relId, EDITOR_USER_ID);
      } catch (relPubError) {
        editorLogger.warn(
          { error: (relPubError as Error).message, relationshipId: relId },
          'Failed to publish relationship'
        );
      }
    }

    // Update intake status
    await updateIntakeEditorStatus(intakeId, 'APPROVED', decision, card.cardId, source.sourceId);

    // Audit log - use PROMOTE_INTAKE action since EDITOR_PUBLISH isn't in the enum
    await logAuditEvent(
      'PROMOTE_INTAKE',
      'intake',
      intakeId,
      EDITOR_USER_ID,
      {
        metadata: {
          cardId: card.cardId,
          sourceId: source.sourceId,
          entityIds: resolvedEntityIds,
          relationshipIds,
          confidence: editorResponse.confidence,
          runId,
          automated: true,
        },
      }
    );

    return {
      intakeId,
      decision: 'PUBLISH',
      reason: editorResponse.reason,
      cardId: card.cardId,
      entityIds: resolvedEntityIds,
      relationshipIds,
    };
  } catch (error) {
    editorLogger.error({ intakeId, error: (error as Error).message }, 'Error processing item');
    return {
      intakeId,
      decision: 'ERROR',
      reason: (error as Error).message,
    };
  }
}

/**
 * Update intake item with editor status
 */
async function updateIntakeEditorStatus(
  intakeId: string,
  editorStatus: 'APPROVED' | 'SKIPPED',
  decision: EditorDecision,
  cardId?: string,
  sourceId?: string
): Promise<void> {
  const now = new Date().toISOString();

  // Get current item using scan with filter (intake items use FEED#<feedId> as PK, not INTAKE#<id>)
  const { items } = await scanItems<IntakeItem & { PK: string; SK: string }>({
    TableName: INTAKE_TABLE,
    FilterExpression: 'intakeId = :id',
    ExpressionAttributeValues: {
      ':id': intakeId,
    },
    Limit: 100, // Scan more items since filter is applied after
  });

  if (items.length === 0) {
    throw new Error(`Intake item ${intakeId} not found`);
  }

  const existing = items[0];

  // Build updated item
  const updated: IntakeItem & { PK: string; SK: string; GSI1PK: string; GSI1SK: string } = {
    ...existing,
    editorStatus,
    editorDecision: decision,
    reviewedAt: now,
    reviewedBy: EDITOR_USER_ID,
    ...(editorStatus === 'APPROVED' && {
      status: 'PROMOTED' as const,
      promotedCardId: cardId,
      promotedSourceId: sourceId,
    }),
    GSI1PK: editorStatus === 'APPROVED' ? 'STATUS#PROMOTED' : `STATUS#${existing.status}`,
    GSI1SK: `TS#${now}`,
  };

  await putItem({
    TableName: INTAKE_TABLE,
    Item: updated,
  });
}

/**
 * Get eligible intake items for editor processing
 */
async function getEligibleItems(limit: number): Promise<IntakeItem[]> {
  // Query for items with status=NEW and extractionStatus=COMPLETED
  // that haven't been processed by the editor yet
  const { items } = await queryItems<IntakeItem & { PK: string; SK: string }>({
    TableName: INTAKE_TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :status',
    FilterExpression: 'extractionStatus = :extracted AND attribute_not_exists(editorStatus)',
    ExpressionAttributeValues: {
      ':status': 'STATUS#NEW',
      ':extracted': 'COMPLETED',
    },
    Limit: limit * 2, // Over-fetch since we're filtering
    ScanIndexForward: false, // Most recent first
  });

  // Additional filtering
  const eligible = items
    .filter((item) => {
      // Must have extracted summary
      if (!item.extractedSummary && !item.summary) return false;

      // Must have at least one entity suggestion with decent confidence
      const hasGoodEntity = (item.suggestedEntities || []).some(
        (e) => e.confidence >= 0.5
      );
      if (!hasGoodEntity) return false;

      return true;
    })
    .slice(0, limit)
    .map((item) => stripKeys(item) as IntakeItem);

  return eligible;
}

/**
 * Run the editor on eligible intake items
 */
export async function runEditor(): Promise<EditorRunSummary> {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  const dryRun = config.editor.dryRun;

  editorLogger.info({ runId, dryRun, enabled: config.editor.enabled }, 'Starting editor run');

  // Check if editor is enabled
  if (!config.editor.enabled) {
    editorLogger.info('Editor is disabled, skipping run');
    return {
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      processed: 0,
      published: 0,
      skipped: 0,
      errors: 0,
      dryRun,
      results: [],
    };
  }

  // Load prompt template
  const template = await loadEditorPrompt();

  // Get eligible items
  const items = await getEligibleItems(config.editor.maxItemsPerRun);
  editorLogger.info({ itemCount: items.length, maxItems: config.editor.maxItemsPerRun }, 'Found eligible items');

  const results: EditorItemResult[] = [];
  let published = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of items) {
    const result = await processItem(item, template, runId, dryRun);
    results.push(result);

    switch (result.decision) {
      case 'PUBLISH':
        published++;
        break;
      case 'SKIP':
        skipped++;
        break;
      case 'ERROR':
        errors++;
        break;
    }

    editorLogger.info(
      { intakeId: item.intakeId, decision: result.decision, reason: result.reason },
      'Processed intake item'
    );
  }

  const completedAt = new Date().toISOString();

  editorLogger.info(
    { runId, processed: items.length, published, skipped, errors, dryRun },
    'Completed editor run'
  );

  return {
    runId,
    startedAt,
    completedAt,
    processed: items.length,
    published,
    skipped,
    errors,
    dryRun,
    results,
  };
}
