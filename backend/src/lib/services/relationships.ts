import { ulid } from 'ulid';
import type {
  Relationship,
  RelationshipType,
  RelationshipStatus,
  CreateRelationshipRequest,
  UpdateRelationshipRequest,
  RelationshipWithEntities,
  RelationshipQueryParams,
  PaginatedResponse,
} from '@ledger/shared';
import { config } from '../config.js';
import {
  getItem,
  putItem,
  queryItems,
  encodeCursor,
  decodeCursor,
  stripKeys,
} from '../dynamodb.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { getEntity } from './entities.js';

const TABLE = config.tables.relationships;

interface RelationshipDbItem extends Relationship {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
}

/**
 * Create a new relationship between two entities
 */
export async function createRelationship(
  input: CreateRelationshipRequest,
  userId: string
): Promise<Relationship> {
  // Validate that both entities exist
  await Promise.all([
    getEntity(input.fromEntityId),
    getEntity(input.toEntityId),
  ]);

  // Validate ownership percentage if provided
  if (input.ownershipPercentage !== undefined) {
    if (input.ownershipPercentage < 0 || input.ownershipPercentage > 100) {
      throw new ValidationError('ownershipPercentage must be between 0 and 100');
    }
  }

  const now = new Date().toISOString();
  const relationshipId = ulid();

  const relationship: Relationship = {
    relationshipId,
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    type: input.type,
    status: 'DRAFT',
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    sourceRefs: input.sourceRefs || [],
    ownershipPercentage: input.ownershipPercentage,
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
  };

  // Build the DynamoDB item with GSI keys for querying
  const item: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'META',
    // GSI1: Query by entity (we store two items per relationship for bidirectional lookup)
    GSI1PK: `ENTITY#${input.fromEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    // GSI2: Query by status
    GSI2PK: `STATUS#${relationship.status}`,
    GSI2SK: `TS#${now}`,
    ...relationship,
  };

  await putItem({
    TableName: TABLE,
    Item: item,
  });

  // Also create a reverse lookup item for the toEntity
  const reverseItem: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'REVERSE',
    GSI1PK: `ENTITY#${input.toEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    ...relationship,
  };

  await putItem({
    TableName: TABLE,
    Item: reverseItem,
  });

  return relationship;
}

/**
 * Get a relationship by ID
 */
export async function getRelationship(relationshipId: string): Promise<Relationship> {
  const item = await getItem<RelationshipDbItem>({
    TableName: TABLE,
    Key: {
      PK: `REL#${relationshipId}`,
      SK: 'META',
    },
  });

  if (!item) {
    throw new NotFoundError('Relationship', relationshipId);
  }

  return stripKeys(item);
}

/**
 * Update a relationship (only allowed for DRAFT status)
 */
export async function updateRelationship(
  relationshipId: string,
  input: UpdateRelationshipRequest,
  userId: string
): Promise<Relationship> {
  const existing = await getRelationship(relationshipId);

  if (existing.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT relationships can be updated');
  }

  // Validate ownership percentage if provided
  if (input.ownershipPercentage !== undefined) {
    if (input.ownershipPercentage < 0 || input.ownershipPercentage > 100) {
      throw new ValidationError('ownershipPercentage must be between 0 and 100');
    }
  }

  const now = new Date().toISOString();

  const updated: Relationship = {
    ...existing,
    type: input.type ?? existing.type,
    description: input.description ?? existing.description,
    startDate: input.startDate ?? existing.startDate,
    endDate: input.endDate ?? existing.endDate,
    sourceRefs: input.sourceRefs ?? existing.sourceRefs,
    ownershipPercentage: input.ownershipPercentage ?? existing.ownershipPercentage,
    updatedAt: now,
    updatedBy: userId,
  };

  // Update both META and REVERSE items
  const item: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'META',
    GSI1PK: `ENTITY#${updated.fromEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    GSI2PK: `STATUS#${updated.status}`,
    GSI2SK: `TS#${updated.createdAt}`,
    ...updated,
  };

  const reverseItem: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'REVERSE',
    GSI1PK: `ENTITY#${updated.toEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    ...updated,
  };

  await Promise.all([
    putItem({ TableName: TABLE, Item: item }),
    putItem({ TableName: TABLE, Item: reverseItem }),
  ]);

  return updated;
}

/**
 * Publish a relationship (DRAFT -> PUBLISHED)
 */
export async function publishRelationship(
  relationshipId: string,
  userId: string
): Promise<Relationship> {
  const existing = await getRelationship(relationshipId);

  if (existing.status !== 'DRAFT') {
    throw new ValidationError('Only DRAFT relationships can be published');
  }

  // Require at least one source reference
  if (!existing.sourceRefs || existing.sourceRefs.length === 0) {
    throw new ValidationError('At least one source reference is required to publish');
  }

  const now = new Date().toISOString();

  const updated: Relationship = {
    ...existing,
    status: 'PUBLISHED',
    publishedAt: now,
    publishedBy: userId,
    updatedAt: now,
    updatedBy: userId,
  };

  // Update both items with new status
  const item: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'META',
    GSI1PK: `ENTITY#${updated.fromEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    GSI2PK: `STATUS#PUBLISHED`,
    GSI2SK: `TS#${now}`,
    ...updated,
  };

  const reverseItem: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'REVERSE',
    GSI1PK: `ENTITY#${updated.toEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    ...updated,
  };

  await Promise.all([
    putItem({ TableName: TABLE, Item: item }),
    putItem({ TableName: TABLE, Item: reverseItem }),
  ]);

  return updated;
}

/**
 * Retract a relationship (PUBLISHED -> RETRACTED)
 */
export async function retractRelationship(
  relationshipId: string,
  reason: string,
  userId: string
): Promise<Relationship> {
  const existing = await getRelationship(relationshipId);

  if (existing.status !== 'PUBLISHED') {
    throw new ValidationError('Only PUBLISHED relationships can be retracted');
  }

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('A retraction reason is required');
  }

  const now = new Date().toISOString();

  const updated: Relationship = {
    ...existing,
    status: 'RETRACTED',
    retractionReason: reason,
    retractedAt: now,
    retractedBy: userId,
    updatedAt: now,
    updatedBy: userId,
  };

  // Update both items with new status
  const item: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'META',
    GSI1PK: `ENTITY#${updated.fromEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    GSI2PK: `STATUS#RETRACTED`,
    GSI2SK: `TS#${now}`,
    ...updated,
  };

  const reverseItem: RelationshipDbItem = {
    PK: `REL#${relationshipId}`,
    SK: 'REVERSE',
    GSI1PK: `ENTITY#${updated.toEntityId}`,
    GSI1SK: `REL#${relationshipId}`,
    ...updated,
  };

  await Promise.all([
    putItem({ TableName: TABLE, Item: item }),
    putItem({ TableName: TABLE, Item: reverseItem }),
  ]);

  return updated;
}

/**
 * List relationships with optional filters
 */
export async function listRelationships(
  params: RelationshipQueryParams
): Promise<PaginatedResponse<Relationship>> {
  const limit = params.limit || 20;
  const exclusiveStartKey = params.cursor ? decodeCursor(params.cursor) : undefined;

  // Query by entity if entityId is provided
  if (params.entityId) {
    const { items, lastEvaluatedKey } = await queryItems<RelationshipDbItem>({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `ENTITY#${params.entityId}`,
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    // Filter by type/status if provided (in-memory filtering)
    let relationships = items.map((item) => stripKeys(item) as Relationship);

    if (params.type) {
      relationships = relationships.filter((r) => r.type === params.type);
    }
    if (params.status) {
      relationships = relationships.filter((r) => r.status === params.status);
    }

    return {
      items: relationships,
      cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
      hasMore: !!lastEvaluatedKey,
    };
  }

  // Query by status if provided
  if (params.status) {
    const { items, lastEvaluatedKey } = await queryItems<RelationshipDbItem>({
      TableName: TABLE,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': `STATUS#${params.status}`,
      },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: false, // Most recent first
    });

    let relationships = items.map((item) => stripKeys(item) as Relationship);

    if (params.type) {
      relationships = relationships.filter((r) => r.type === params.type);
    }

    return {
      items: relationships,
      cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
      hasMore: !!lastEvaluatedKey,
    };
  }

  // Default: query all DRAFT relationships for admin review
  const { items, lastEvaluatedKey } = await queryItems<RelationshipDbItem>({
    TableName: TABLE,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'STATUS#DRAFT',
    },
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
    ScanIndexForward: false,
  });

  const relationships = items.map((item) => stripKeys(item) as Relationship);

  return {
    items: relationships,
    cursor: lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : undefined,
    hasMore: !!lastEvaluatedKey,
  };
}

/**
 * Get relationships for an entity with hydrated entity details
 */
export async function getRelationshipsForEntity(
  entityId: string,
  status?: RelationshipStatus
): Promise<RelationshipWithEntities[]> {
  const { items } = await queryItems<RelationshipDbItem>({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `ENTITY#${entityId}`,
    },
    Limit: 100, // Reasonable limit for entity relationships
  });

  let relationships = items.map((item) => stripKeys(item) as Relationship);

  if (status) {
    relationships = relationships.filter((r) => r.status === status);
  }

  // Hydrate with entity details
  const entityIds = new Set<string>();
  for (const rel of relationships) {
    entityIds.add(rel.fromEntityId);
    entityIds.add(rel.toEntityId);
  }

  const entityMap = new Map<string, { entityId: string; name: string; type: string }>();
  await Promise.all(
    Array.from(entityIds).map(async (id) => {
      try {
        const entity = await getEntity(id);
        entityMap.set(id, {
          entityId: entity.entityId,
          name: entity.name,
          type: entity.type,
        });
      } catch {
        entityMap.set(id, {
          entityId: id,
          name: '[Unknown Entity]',
          type: 'UNKNOWN',
        });
      }
    })
  );

  return relationships.map((rel) => ({
    ...rel,
    fromEntity: entityMap.get(rel.fromEntityId)!,
    toEntity: entityMap.get(rel.toEntityId)!,
  }));
}

/**
 * Get public (published) relationships for an entity
 */
export async function getPublicRelationshipsForEntity(
  entityId: string
): Promise<RelationshipWithEntities[]> {
  return getRelationshipsForEntity(entityId, 'PUBLISHED');
}
