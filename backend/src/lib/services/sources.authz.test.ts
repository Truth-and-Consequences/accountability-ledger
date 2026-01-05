import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SourceNotPublicError, NotFoundError } from '../errors.js';

// Mock config before importing sources
vi.mock('../config.js', () => ({
  config: {
    tables: { sources: 'test-sources-table' },
    buckets: { sources: 'test-sources-bucket' },
    api: { presignedUrlExpirySeconds: 3600 },
  },
}));

// Mock DynamoDB
const mockGetItem = vi.fn();
vi.mock('../dynamodb.js', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  putItem: vi.fn(),
  stripKeys: vi.fn((item: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { PK, SK, ...rest } = item;
    return rest;
  }),
}));

// Mock S3
vi.mock('../s3.js', () => ({
  getPresignedDownloadUrl: vi.fn(() => Promise.resolve('https://signed-url.example.com')),
  getPresignedUploadUrl: vi.fn(() => Promise.resolve('https://upload-url.example.com')),
  getObjectMetadata: vi.fn(() => null),
  getObjectStream: vi.fn(() => null),
  putObject: vi.fn(),
  copyObject: vi.fn(),
  deleteObject: vi.fn(),
}));

// Mock KMS
vi.mock('../kms.js', () => ({
  signData: vi.fn(() =>
    Promise.resolve({
      signature: 'test-signature',
      keyId: 'test-key-id',
      algorithm: 'RSASSA_PSS_SHA_256',
    })
  ),
}));

// Mock card service
const mockIsSourceReferencedByPublishedCard = vi.fn();
vi.mock('./cards.js', () => ({
  isSourceReferencedByPublishedCard: (...args: unknown[]) =>
    mockIsSourceReferencedByPublishedCard(...args),
}));

// Import after mocks are set up
import { generateDownloadUrl } from './sources.js';

describe('Source Download Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateDownloadUrl', () => {
    it('throws SourceNotPublicError when source is not VERIFIED', async () => {
      mockGetItem.mockResolvedValueOnce({
        PK: 'SOURCE#src_123',
        SK: 'META',
        sourceId: 'src_123',
        title: 'Unverified Source',
        publisher: 'Test',
        url: 'https://example.com/doc',
        docType: 'PDF',
        verificationStatus: 'PENDING', // Not verified
        s3Key: 'sources/src_123/hash.pdf',
      });

      await expect(generateDownloadUrl('src_123')).rejects.toThrow(SourceNotPublicError);
    });

    it('throws SourceNotPublicError when source is FAILED verification', async () => {
      mockGetItem.mockResolvedValueOnce({
        PK: 'SOURCE#src_456',
        SK: 'META',
        sourceId: 'src_456',
        title: 'Failed Source',
        publisher: 'Test',
        url: 'https://example.com/doc',
        docType: 'PDF',
        verificationStatus: 'FAILED', // Failed verification
        s3Key: 'sources/src_456/hash.pdf',
      });

      await expect(generateDownloadUrl('src_456')).rejects.toThrow(SourceNotPublicError);
    });

    it('throws SourceNotPublicError when source is VERIFIED but not referenced by published card', async () => {
      mockGetItem.mockResolvedValueOnce({
        PK: 'SOURCE#src_789',
        SK: 'META',
        sourceId: 'src_789',
        title: 'Verified but Unreferenced Source',
        publisher: 'Test',
        url: 'https://example.com/doc',
        docType: 'PDF',
        verificationStatus: 'VERIFIED', // Is verified
        s3Key: 'sources/src_789/hash.pdf',
      });

      // Source is not referenced by any published card
      mockIsSourceReferencedByPublishedCard.mockResolvedValueOnce(false);

      await expect(generateDownloadUrl('src_789')).rejects.toThrow(SourceNotPublicError);
    });

    it('throws NotFoundError when source has no s3Key', async () => {
      mockGetItem.mockResolvedValueOnce({
        PK: 'SOURCE#src_no_file',
        SK: 'META',
        sourceId: 'src_no_file',
        title: 'Source Without File',
        publisher: 'Test',
        url: 'https://example.com/doc',
        docType: 'PDF',
        verificationStatus: 'VERIFIED',
        // No s3Key
      });

      await expect(generateDownloadUrl('src_no_file')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when source does not exist', async () => {
      mockGetItem.mockResolvedValueOnce(null);

      await expect(generateDownloadUrl('nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('returns download URL when source is VERIFIED and referenced by published card', async () => {
      mockGetItem.mockResolvedValueOnce({
        PK: 'SOURCE#src_valid',
        SK: 'META',
        sourceId: 'src_valid',
        title: 'Valid Public Source',
        publisher: 'Reuters',
        url: 'https://reuters.com/article',
        docType: 'HTML',
        verificationStatus: 'VERIFIED',
        mimeType: 'text/html',
        s3Key: 'sources/src_valid/hash.html',
      });

      // Source IS referenced by a published card
      mockIsSourceReferencedByPublishedCard.mockResolvedValueOnce(true);

      const result = await generateDownloadUrl('src_valid');

      expect(result).toHaveProperty('downloadUrl');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('filename', 'Valid Public Source');
      expect(mockIsSourceReferencedByPublishedCard).toHaveBeenCalledWith('src_valid');
    });
  });

  describe('Authorization flow order', () => {
    it('checks verification status before card reference', async () => {
      mockGetItem.mockResolvedValueOnce({
        PK: 'SOURCE#src_order_test',
        SK: 'META',
        sourceId: 'src_order_test',
        title: 'Order Test Source',
        publisher: 'Test',
        url: 'https://example.com',
        docType: 'PDF',
        verificationStatus: 'PENDING', // Not verified
        s3Key: 'sources/src_order_test/hash.pdf',
      });

      await expect(generateDownloadUrl('src_order_test')).rejects.toThrow(SourceNotPublicError);

      // Should not even check if source is referenced since verification failed first
      expect(mockIsSourceReferencedByPublishedCard).not.toHaveBeenCalled();
    });
  });
});
