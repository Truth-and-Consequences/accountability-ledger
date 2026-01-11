// Intake types for automated RSS ingestion

import type { EntityType, RelationshipType } from './enums.js';

export type IntakeStatus = 'NEW' | 'REVIEWED' | 'PROMOTED' | 'REJECTED';

// LLM extraction status
export type ExtractionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

// LLM editor decision status
export type EditorStatus = 'PENDING' | 'APPROVED' | 'SKIPPED';

// Editor decision record
export interface EditorDecision {
  decision: 'PUBLISH' | 'SKIP';
  reason: string;
  confidence: number;
  decidedAt: string;
  runId: string;
}

// Entity suggestion from LLM extraction
export interface SuggestedEntity {
  // Name as extracted from text
  extractedName: string;

  // Suggested type based on context
  suggestedType: EntityType;

  // Confidence score (0.0 - 1.0)
  confidence: number;

  // If matched to existing entity in database
  matchedEntityId?: string;
  matchedEntityName?: string;

  // Evidence snippet from source text
  evidenceSnippet?: string;
}

// Source/document link suggestion from LLM extraction
export interface SuggestedSource {
  // URL of the linked document
  url: string;

  // Title or description (from link text or context)
  title: string;

  // Type hint based on URL or context (PDF, court filing, press release, etc.)
  sourceType?: string;

  // Confidence score (0.0 - 1.0)
  confidence: number;

  // Evidence/context from the article
  evidenceSnippet?: string;
}

// Relationship suggestion from LLM extraction
export interface SuggestedRelationship {
  // The two entities in the relationship
  fromEntity: {
    extractedName: string;
    matchedEntityId?: string;
    matchedEntityName?: string;
  };
  toEntity: {
    extractedName: string;
    matchedEntityId?: string;
    matchedEntityName?: string;
  };

  // Relationship details
  suggestedType: RelationshipType;
  confidence: number;

  // Evidence from source text
  evidenceSnippet: string;

  // Optional additional context
  description?: string;
}

export interface IntakeItem {
  // Primary identifiers
  intakeId: string;        // ULID
  feedId: string;          // e.g., "ftc_press_releases"

  // Content from RSS feed
  canonicalUrl: string;
  title: string;
  publishedAt: string;     // ISO timestamp from feed
  publisher: string;       // FTC, SEC, DOJ, GAO
  summary?: string;        // RSS description/summary
  categories?: string[];   // RSS categories
  guid?: string;           // RSS guid if available

  // Dedupe key (sha256 of canonicalUrl + publishedAt)
  dedupeKey: string;

  // Processing status
  status: IntakeStatus;

  // Tag suggestions (from feed defaults)
  suggestedTags?: string[];

  // LLM extraction results
  extractedSummary?: string;  // AI-generated summary (2-3 sentences)
  suggestedEntities?: SuggestedEntity[];
  suggestedRelationships?: SuggestedRelationship[];
  suggestedSources?: SuggestedSource[];
  extractionStatus?: ExtractionStatus;
  extractedAt?: string;
  extractionError?: string;

  // Snapshot info (if captured)
  snapshot?: IntakeSnapshot;

  // Promotion tracking
  promotedSourceId?: string;
  promotedCardId?: string;

  // LLM editor tracking
  editorStatus?: EditorStatus;
  editorDecision?: EditorDecision;

  // Timestamps
  ingestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;

  // Error tracking
  error?: string;
}

export interface IntakeSnapshot {
  bucket: string;
  key: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  capturedAt: string;
}

// Feed configuration
export interface FeedConfig {
  id: string;
  publisher: string;
  name: string;
  url: string;
  defaultTags: string[];
  perFeedCap: number;
  enabled: boolean;
}

export interface IntakeRails {
  maxItemsPerRun: number;
  maxPerFeedPerRun: number;
  maxRequestsPerHostPerMinute: number;
  minDelayMsBetweenRequestsSameHost: number;
  fetchTimeoutMs: number;
  maxHtmlSnapshotBytes: number;
  maxPdfBytes: number;
  allowedDomains: string[];
  stripQueryParams: string[];
}

export interface IntakeFeedsConfig {
  version: number;
  globalRails: IntakeRails;
  feeds: FeedConfig[];
}

// API types
export interface IntakeListResponse {
  items: IntakeItem[];
  nextToken?: string;
}

export interface IntakePromoteRequest {
  // Legacy single entity (backwards compat)
  entityId?: string;         // Optional: link to existing entity
  createEntity?: {           // Optional: create new entity
    name: string;
    type: string;
  };
  // Multi-entity support
  entityIds?: string[];      // Optional: link to multiple existing entities
  createEntities?: Array<{   // Optional: create multiple new entities
    name: string;
    type: string;
  }>;
  // Relationship creation (from LLM suggestions)
  createRelationships?: Array<{
    fromEntityId: string;
    toEntityId: string;
    type: string;            // RelationshipType
    description?: string;
  }>;
  // Card metadata
  tags?: string[];
  cardSummary: string;
}

export interface IntakePromoteResponse {
  sourceId: string;
  cardId: string;
  entityIds?: string[];        // All entity IDs linked to the card
  relationshipIds?: string[];  // All relationship IDs created (as DRAFT)
}

export interface IntakeIngestResult {
  feedId: string;
  itemsIngested: number;
  itemsSkipped: number;
  errors: string[];
}

export interface IntakeRunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  totalIngested: number;
  totalSkipped: number;
  feedResults: IntakeIngestResult[];
}