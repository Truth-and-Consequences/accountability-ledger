import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listRelationships } from './relationships.js';
import * as dynamodb from '../dynamodb.js';
import * as entities from './entities.js';
import type { Relationship, Entity } from '@ledger/shared';

// Mock dynamodb module
vi.mock('../dynamodb.js', () => ({
  getItem: vi.fn(),
  putItem: vi.fn(),
  queryItems: vi.fn(),
  encodeCursor: vi.fn((key) => Buffer.from(JSON.stringify(key)).toString('base64url')),
  decodeCursor: vi.fn((cursor) => JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'))),
  stripKeys: vi.fn((item) => {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...rest } = item;
    return rest;
  }),
}));

// Mock entities module
vi.mock('./entities.js', () => ({
  getEntity: vi.fn(),
}));

// Mock config
vi.mock('../config.js', () => ({
  config: {
    tables: {
      relationships: 'test-relationships-table',
    },
  },
}));

describe('relationships service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listRelationships', () => {
    it('returns relationships with hydrated entity data (fromEntity, toEntity)', async () => {
      // This test verifies the bug fix: listRelationships was returning relationships
      // without fromEntity/toEntity, causing "can't access property 'name', fromEntity is undefined"

      const mockRelationship: Relationship & { PK: string; SK: string; GSI2PK: string; GSI2SK: string } = {
        PK: 'REL#rel123',
        SK: 'META',
        GSI2PK: 'STATUS#DRAFT',
        GSI2SK: 'TS#2024-01-01T00:00:00Z',
        relationshipId: 'rel123',
        fromEntityId: 'entity1',
        toEntityId: 'entity2',
        type: 'SUBSIDIARY_OF',
        status: 'DRAFT',
        sourceRefs: [],
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'user-123',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockEntity1: Entity = {
        entityId: 'entity1',
        name: 'Parent Corp',
        type: 'CORPORATION',
        aliases: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockEntity2: Entity = {
        entityId: 'entity2',
        name: 'Subsidiary Inc',
        type: 'CORPORATION',
        aliases: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [mockRelationship],
        lastEvaluatedKey: undefined,
      });

      vi.mocked(entities.getEntity).mockImplementation(async (id: string) => {
        if (id === 'entity1') return mockEntity1;
        if (id === 'entity2') return mockEntity2;
        throw new Error('Entity not found');
      });

      const result = await listRelationships({});

      // Verify the result has hydrated entity objects
      expect(result.items).toHaveLength(1);
      expect(result.items[0].fromEntity).toBeDefined();
      expect(result.items[0].toEntity).toBeDefined();
      expect(result.items[0].fromEntity.name).toBe('Parent Corp');
      expect(result.items[0].fromEntity.entityId).toBe('entity1');
      expect(result.items[0].fromEntity.type).toBe('CORPORATION');
      expect(result.items[0].toEntity.name).toBe('Subsidiary Inc');
      expect(result.items[0].toEntity.entityId).toBe('entity2');
      expect(result.items[0].toEntity.type).toBe('CORPORATION');
    });

    it('handles unknown entities gracefully with placeholder data', async () => {
      const mockRelationship: Relationship & { PK: string; SK: string; GSI2PK: string; GSI2SK: string } = {
        PK: 'REL#rel456',
        SK: 'META',
        GSI2PK: 'STATUS#DRAFT',
        GSI2SK: 'TS#2024-01-01T00:00:00Z',
        relationshipId: 'rel456',
        fromEntityId: 'missing-entity-1',
        toEntityId: 'missing-entity-2',
        type: 'OWNS',
        status: 'DRAFT',
        sourceRefs: [],
        createdAt: '2024-01-01T00:00:00Z',
        createdBy: 'user-123',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [mockRelationship],
        lastEvaluatedKey: undefined,
      });

      // Simulate entities not found
      vi.mocked(entities.getEntity).mockRejectedValue(new Error('Entity not found'));

      const result = await listRelationships({});

      // Should still return relationships with placeholder entity data
      expect(result.items).toHaveLength(1);
      expect(result.items[0].fromEntity).toBeDefined();
      expect(result.items[0].toEntity).toBeDefined();
      expect(result.items[0].fromEntity.name).toBe('[Unknown Entity]');
      expect(result.items[0].toEntity.name).toBe('[Unknown Entity]');
    });

    it('returns empty array when no relationships exist', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      const result = await listRelationships({});

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('filters by status when provided', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listRelationships({ status: 'PUBLISHED' });

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: {
            ':pk': 'STATUS#PUBLISHED',
          },
        })
      );
    });

    it('filters by entityId when provided', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listRelationships({ entityId: 'entity123' });

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': 'ENTITY#entity123',
          },
        })
      );
    });
  });
});