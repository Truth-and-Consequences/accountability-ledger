import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { handler } from './api.js';

// Mock SSM to prevent read-only mode checks from hitting AWS
vi.mock('../lib/ssm.js', () => ({
  isReadOnlyMode: vi.fn(() => Promise.resolve(false)),
}));

// Mock services to avoid hitting real databases
vi.mock('../lib/services/entities.js', () => ({
  createEntity: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
  getEntity: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
  listEntities: vi.fn(() => Promise.resolve({ items: [], hasMore: false })),
}));

vi.mock('../lib/services/cards.js', () => ({
  createCard: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
  getCard: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
  listCards: vi.fn(() => Promise.resolve({ items: [], hasMore: false })),
  isSourceReferencedByPublishedCard: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('../lib/services/sources.js', () => ({
  getSource: vi.fn(() =>
    Promise.resolve({
      sourceId: 'src_123',
      title: 'Test Source',
      publisher: 'Test',
      url: 'https://example.com',
      docType: 'HTML',
      verificationStatus: 'PENDING',
      s3Key: 'test.html',
    })
  ),
  generateDownloadUrl: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
}));

vi.mock('../lib/services/intake.js', () => ({
  listIntake: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
}));

vi.mock('../lib/services/relationships.js', () => ({
  listRelationships: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
}));

vi.mock('../lib/services/summary.js', () => ({
  getEntitySummary: vi.fn(() => Promise.reject(new Error('Should not reach service'))),
}));

vi.mock('../lib/services/audit.js', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
}));

// Helper to create a minimal JWT (not cryptographically valid, just for testing payload parsing)
function createTestJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'test_signature';
  return `${header}.${body}.${signature}`;
}

// Helper to create a mock API Gateway event
function createMockEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/health',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'testapi',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/health',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'test-request-id',
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: 'test',
  logStreamName: 'test',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('Authorization Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Admin endpoints require authentication', () => {
    it('returns 401 for admin endpoint without JWT', async () => {
      const event = createMockEvent({
        rawPath: '/admin/entities',
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'POST',
            path: '/admin/entities',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });

    it('returns 401 for admin endpoint with invalid JWT format', async () => {
      const event = createMockEvent({
        rawPath: '/admin/entities',
        headers: {
          authorization: 'Bearer invalid-token',
        },
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'POST',
            path: '/admin/entities',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Admin endpoints require admin group membership', () => {
    it('returns 403 for admin endpoint with valid JWT but no admin group', async () => {
      const token = createTestJwt({
        sub: 'user-123',
        'cognito:groups': ['users'], // Not in admin group
      });

      const event = createMockEvent({
        rawPath: '/admin/entities',
        headers: {
          authorization: `Bearer ${token}`,
        },
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'POST',
            path: '/admin/entities',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Admin group membership required');
    });

    it('returns 403 for admin endpoint with valid JWT but empty groups', async () => {
      const token = createTestJwt({
        sub: 'user-123',
        'cognito:groups': [],
      });

      const event = createMockEvent({
        rawPath: '/admin/cards',
        headers: {
          authorization: `Bearer ${token}`,
        },
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'GET',
            path: '/admin/cards',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(403);

      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 for admin intake endpoint without admin group', async () => {
      const token = createTestJwt({
        sub: 'user-456',
        'cognito:groups': ['viewers'],
      });

      const event = createMockEvent({
        rawPath: '/admin/intake',
        headers: {
          authorization: `Bearer ${token}`,
        },
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'GET',
            path: '/admin/intake',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(403);
    });
  });

  describe('Public endpoints do not require authentication', () => {
    it('allows unauthenticated access to /health', async () => {
      const event = createMockEvent({
        rawPath: '/health',
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'GET',
            path: '/health',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
    });

    it('allows unauthenticated access to /entities', async () => {
      const event = createMockEvent({
        rawPath: '/entities',
        requestContext: {
          ...createMockEvent().requestContext,
          http: {
            method: 'GET',
            path: '/entities',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
        },
      });

      const result = await handler(event, mockContext);

      const response = result as { statusCode: number; body: string };
      expect(response.statusCode).toBe(200);
    });
  });

  describe('Multiple admin routes are protected', () => {
    const adminRoutes = [
      { method: 'POST', path: '/admin/entities' },
      { method: 'PUT', path: '/admin/entities/ent_123' },
      { method: 'POST', path: '/admin/sources' },
      { method: 'POST', path: '/admin/cards' },
      { method: 'GET', path: '/admin/cards' },
      { method: 'PUT', path: '/admin/cards/card_123' },
      { method: 'GET', path: '/admin/intake' },
      { method: 'POST', path: '/admin/intake/int_123/promote' },
      { method: 'POST', path: '/admin/relationships' },
      { method: 'GET', path: '/admin/relationships' },
    ];

    adminRoutes.forEach(({ method, path }) => {
      it(`returns 401 for ${method} ${path} without JWT`, async () => {
        const event = createMockEvent({
          rawPath: path,
          requestContext: {
            ...createMockEvent().requestContext,
            http: {
              method,
              path,
              protocol: 'HTTP/1.1',
              sourceIp: '127.0.0.1',
              userAgent: 'test',
            },
          },
        });

        const result = await handler(event, mockContext);

        const response = result as { statusCode: number; body: string };
        expect(response.statusCode).toBe(401);

        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('UNAUTHORIZED');
      });
    });
  });
});
