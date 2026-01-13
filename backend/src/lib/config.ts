// Environment configuration
export const config = {
  // AWS Region
  region: process.env.AWS_REGION || 'us-east-1',

  // DynamoDB Tables
  tables: {
    entities: process.env.ENTITIES_TABLE || 'LedgerEntities',
    cards: process.env.CARDS_TABLE || 'LedgerCards',
    sources: process.env.SOURCES_TABLE || 'LedgerSources',
    audit: process.env.AUDIT_TABLE || 'LedgerAudit',
    idempotency: process.env.IDEMPOTENCY_TABLE || 'LedgerIdempotency',
    tagIndex: process.env.TAG_INDEX_TABLE || 'LedgerTagIndex',
    intake: process.env.INTAKE_TABLE || 'LedgerIntake',
    relationships: process.env.RELATIONSHIPS_TABLE || 'LedgerRelationships',
  },

  // S3 Buckets
  buckets: {
    sources: process.env.SOURCES_BUCKET || 'ledger-sources',
    publicSite: process.env.PUBLIC_SITE_BUCKET || 'ledger-public-site',
  },

  // KMS
  kms: {
    signingKeyId: process.env.KMS_SIGNING_KEY_ID || '',
  },

  // API settings
  api: {
    defaultPageSize: 20,
    maxPageSize: 100,
    presignedUrlExpirySeconds: 3600, // 1 hour
    idempotencyTtlHours: 48,
  },

  // Feature flags
  features: {
    readOnly: process.env.LEDGER_READONLY === 'true',
  },

  // Anthropic API (for LLM extraction)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
  },

  // LLM extraction settings
  extraction: {
    maxTokens: parseInt(process.env.EXTRACTION_MAX_TOKENS || '8192', 10),
    minConfidence: parseFloat(process.env.EXTRACTION_MIN_CONFIDENCE || '0.5'),
    maxItemsPerRun: parseInt(process.env.EXTRACTION_MAX_ITEMS || '50', 10),
    retryAttempts: parseInt(process.env.EXTRACTION_RETRY_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.EXTRACTION_RETRY_DELAY_MS || '1000', 10),
    promptTemplateBucket: process.env.EXTRACTION_PROMPT_BUCKET || '',
    promptTemplateKey: process.env.EXTRACTION_PROMPT_KEY || 'prompts/extraction-template.txt',
  },

  // LLM editor settings (autonomous publishing)
  editor: {
    enabled: process.env.EDITOR_ENABLED === 'true',
    dryRun: process.env.EDITOR_DRY_RUN === 'true',
    maxItemsPerRun: parseInt(process.env.EDITOR_MAX_ITEMS || '20', 10),
    minConfidence: parseFloat(process.env.EDITOR_MIN_CONFIDENCE || '0.8'),
    promptTemplateKey: process.env.EDITOR_PROMPT_KEY || 'prompts/editor-template.txt',
  },

  // App version (set during build)
  version: process.env.APP_VERSION || '0.1.0',
} as const;
