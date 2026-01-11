import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listPublishedCards, listEntityCards } from './cards.js';
import * as dynamodb from '../dynamodb.js';

// Mock dynamodb module
vi.mock('../dynamodb.js', () => ({
  getItem: vi.fn(),
  putItem: vi.fn(),
  queryItems: vi.fn(),
  scanItems: vi.fn(),
  updateItem: vi.fn(),
  encodeCursor: vi.fn((key) => Buffer.from(JSON.stringify(key)).toString('base64')),
  decodeCursor: vi.fn((cursor) => JSON.parse(Buffer.from(cursor, 'base64').toString())),
  stripKeys: vi.fn((item) => {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...rest } = item;
    return rest;
  }),
}));

// Mock config
vi.mock('../config.js', () => ({
  config: {
    tables: {
      cards: 'test-cards-table',
      sources: 'test-sources-table',
      entities: 'test-entities-table',
      audit: 'test-audit-table',
    },
    buckets: {
      sources: 'test-sources-bucket',
    },
  },
}));

describe('cards service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listPublishedCards', () => {
    it('queries published cards without category filter', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listPublishedCards({ limit: 20 });

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-cards-table',
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          FilterExpression: undefined,
          ExpressionAttributeNames: undefined,
        })
      );
    });

    it('filters by category when provided', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listPublishedCards({ category: 'labor', limit: 20 });

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-cards-table',
          IndexName: 'GSI1',
          FilterExpression: '#category = :category',
          ExpressionAttributeNames: { '#category': 'category' },
          ExpressionAttributeValues: expect.objectContaining({
            ':category': 'labor',
          }),
        })
      );
    });

    it('uses expression attribute name alias for category (reserved keyword protection)', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listPublishedCards({ category: 'consumer', limit: 10 });

      const callArgs = vi.mocked(dynamodb.queryItems).mock.calls[0][0];

      // Should use #category alias, not raw 'category'
      expect(callArgs.FilterExpression).toBe('#category = :category');
      expect(callArgs.ExpressionAttributeNames).toEqual({ '#category': 'category' });
    });
  });

  describe('listEntityCards', () => {
    it('queries cards for entity without status filter', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listEntityCards('entity-123', { limit: 20 });

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-cards-table',
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          FilterExpression: undefined,
          ExpressionAttributeNames: undefined,
        })
      );
    });

    it('filters by status when provided using expression attribute name alias', async () => {
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listEntityCards('entity-123', { status: 'PUBLISHED', limit: 20 });

      expect(dynamodb.queryItems).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-cards-table',
          IndexName: 'GSI2',
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: expect.objectContaining({
            ':status': 'PUBLISHED',
          }),
        })
      );
    });

    it('uses #status alias to avoid DynamoDB reserved keyword error', async () => {
      // This test verifies the fix for:
      // "Invalid FilterExpression: Attribute name is a reserved keyword; reserved keyword: status"
      vi.mocked(dynamodb.queryItems).mockResolvedValueOnce({
        items: [],
        lastEvaluatedKey: undefined,
      });

      await listEntityCards('entity-456', { status: 'DRAFT', limit: 10 });

      const callArgs = vi.mocked(dynamodb.queryItems).mock.calls[0][0];

      // Must use #status alias, NOT raw 'status' which is a DynamoDB reserved keyword
      expect(callArgs.FilterExpression).toBe('#status = :status');
      expect(callArgs.ExpressionAttributeNames).toEqual({ '#status': 'status' });

      // Verify we're not using the problematic 'status = :status' pattern
      expect(callArgs.FilterExpression).not.toBe('status = :status');
    });
  });
});
