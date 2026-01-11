# LLM Editor Agent - Implementation Plan

## Overview

Create an autonomous LLM-powered "editor" Lambda that reviews intake items, promotes them to cards with entities and relationships, and publishes them to the public feed. The system will run on a schedule (cron) with conservative editorial standards.

## Key Design Decisions

### Editorial Philosophy
- **Conservative approach**: Only auto-publish clear-cut cases with strong evidence
- **High confidence threshold**: Require 0.8+ confidence on extracted entities
- **Skip ambiguous items**: Leave unclear cases in inbox for manual review when you return
- **Prefer existing entities**: Match to database entities rather than creating new ones
- **Source verification required**: Only publish cards with verified sources

### Safety Rails
1. **No destructive actions**: Editor can only promote/publish, never delete or retract
2. **Rate limiting**: Max 20 items per run to prevent runaway costs
3. **Audit trail**: All actions logged with `createdBy: 'llm-editor'` for accountability
4. **Skip list**: Items with low confidence or missing data are skipped, not failed
5. **Dry-run mode**: Environment variable to test without writing to database

## Architecture

```
EventBridge (cron: 7:00 AM UTC daily)
    |
    v
intake-editor Lambda (10 min timeout, 1024MB)
    |
    +-- 1. Query intake items with status=NEW and extractionStatus=COMPLETED
    |
    +-- 2. For each item, call Claude to make editorial decision:
    |       - Should this be published? (yes/no/skip)
    |       - Which entities to use (from extracted suggestions)
    |       - Which relationships to create
    |       - Final card summary (refined from extracted summary)
    |
    +-- 3. For approved items:
    |       a) Create/match entities
    |       b) Create source (with HTML snapshot)
    |       c) Create card (DRAFT)
    |       d) Create relationships (DRAFT)
    |       e) Publish card (DRAFT -> PUBLISHED)
    |       f) Publish relationships (DRAFT -> PUBLISHED)
    |       g) Mark intake as PROMOTED
    |
    +-- 4. Return summary stats
```

## New Files

### 1. Handler: `backend/src/handlers/intake-editor.ts`

```typescript
// Lambda handler for the LLM editor
// - Triggered by EventBridge schedule
// - Processes COMPLETED intake items
// - Uses Claude to make editorial decisions
// - Promotes and publishes approved items
```

### 2. Service: `backend/src/lib/services/editor.ts`

```typescript
// Core editor logic
// - Editorial decision-making via Claude
// - Item processing pipeline
// - Confidence thresholds and skip logic
```

### 3. Prompt: `prompts/editor-template.txt` (S3)

The editor prompt will include:
- Your editorial guidelines (conservative, evidence-first)
- The intake item metadata and extracted data
- Instructions for making publish/skip decisions
- JSON output schema for the decision

## Editor Prompt Design

```
You are an editorial assistant for an accountability ledger platform. Your job is to review intake items and decide whether they should be published to the public feed.

## Editorial Guidelines
- CONSERVATIVE: Only approve items with clear, verifiable misconduct claims
- EVIDENCE-FIRST: Require at least one reliable source reference
- ENTITY MATCHING: Prefer matching to existing entities over creating new ones
- SKIP IF UNSURE: When in doubt, skip the item for human review

## Item to Review
Title: {{TITLE}}
Publisher: {{PUBLISHER}}
Published: {{PUBLISHED_AT}}
URL: {{URL}}

## Extracted Summary
{{EXTRACTED_SUMMARY}}

## Extracted Entities (with confidence scores)
{{ENTITIES_JSON}}

## Extracted Relationships
{{RELATIONSHIPS_JSON}}

## Existing Entity Matches
{{MATCHED_ENTITIES_JSON}}

## Your Task
Analyze this item and decide:
1. Should this be published? (PUBLISH / SKIP)
2. If PUBLISH: Which entities to link (prefer matched over new)
3. If PUBLISH: Which relationships to create
4. If PUBLISH: Refine the summary for public display

Respond with JSON only:
{
  "decision": "PUBLISH" | "SKIP",
  "reason": "Brief explanation for the decision",
  "entities": [
    { "entityId": "existing-id" } | { "create": { "name": "...", "type": "..." } }
  ],
  "relationships": [
    { "fromEntityIndex": 0, "toEntityIndex": 1, "type": "OWNS", "description": "..." }
  ],
  "cardSummary": "Refined summary for public display",
  "confidence": 0.0-1.0
}
```

## Configuration

### Environment Variables
```
EDITOR_ENABLED=true              # Kill switch
EDITOR_DRY_RUN=false             # Test mode (no writes)
EDITOR_MAX_ITEMS=20              # Max items per run
EDITOR_MIN_CONFIDENCE=0.8        # Skip below this
EDITOR_PROMPT_KEY=prompts/editor-template.txt
```

### CDK Infrastructure Changes

Add to `ledger-stack.ts`:
- New Lambda function `intake-editor`
- EventBridge rule: `cron(0 7 * * ? *)` (7 AM UTC daily)
- Permissions: intake table, entities table, cards table, relationships table, sources table/bucket

## Processing Logic

### Item Selection Criteria
1. `status === 'NEW'` - Not yet promoted
2. `extractionStatus === 'COMPLETED'` - Has LLM extraction data
3. Has at least one extracted entity with confidence >= 0.5
4. Has non-empty extracted summary
5. Not in skip list (items previously skipped by editor)

### Decision Flow
```
For each eligible item:
  1. Build editor prompt with item data
  2. Call Claude for decision
  3. If decision === 'SKIP':
     - Mark item with editorStatus: 'SKIPPED'
     - Log reason
     - Continue to next item
  4. If decision === 'PUBLISH' AND confidence >= MIN_CONFIDENCE:
     - Execute promotion pipeline
     - Publish card and relationships
     - Mark item as PROMOTED
  5. If confidence < MIN_CONFIDENCE:
     - Treat as SKIP (too uncertain)
```

### Promotion Pipeline (for approved items)
```
1. Resolve entities:
   - Use matched entityIds where available
   - Create new entities only if no match exists

2. Create source:
   - From intake metadata
   - Capture HTML snapshot
   - Wait for verification

3. Create card (DRAFT):
   - title: from intake
   - summary: from editor decision (refined)
   - entityIds: resolved entity IDs
   - sourceRefs: [sourceId]
   - category: 'consumer'
   - evidenceStrength: 'HIGH'
   - tags: from intake suggestedTags

4. Create relationships (DRAFT):
   - Use entity indices from decision
   - Add sourceRef to each relationship

5. Publish card:
   - Verify sources are VERIFIED
   - Transition DRAFT -> PUBLISHED

6. Publish relationships:
   - Verify sourceRefs exist
   - Transition DRAFT -> PUBLISHED

7. Update intake:
   - status: 'PROMOTED'
   - promotedBy: 'llm-editor'
   - promotedAt: now
```

## Intake Table Schema Changes

Add new fields to track editor decisions:
```typescript
interface IntakeItem {
  // ... existing fields ...

  // Editor tracking
  editorStatus?: 'PENDING' | 'APPROVED' | 'SKIPPED';
  editorDecision?: {
    decision: 'PUBLISH' | 'SKIP';
    reason: string;
    confidence: number;
    decidedAt: string;
  };
  editorRunId?: string;  // Which run processed this item
}
```

## Observability

### Logging
- Structured JSON logs with Pino
- Request ID correlation
- Token usage tracking
- Decision audit trail

### Metrics (CloudWatch)
- Items processed per run
- Approval rate
- Skip rate by reason
- Average confidence scores
- Token costs per run

### Alerts
- Error rate > 10%
- No items processed in 24h (if items exist)
- Claude API failures

## Testing Strategy

1. **Unit tests**: Decision parsing, entity resolution logic
2. **Integration tests**: Full pipeline with mock Claude responses
3. **Dry-run validation**: Run with `EDITOR_DRY_RUN=true` first
4. **Manual review**: Check first few published items before going on vacation

## Rollout Plan

1. Deploy Lambda with `EDITOR_ENABLED=false`
2. Upload editor prompt to S3
3. Enable dry-run mode, test on dev
4. Review dry-run output
5. Enable live mode on dev
6. Verify published items look correct
7. Deploy to prod with dry-run
8. Enable live mode before vacation

## Estimated Implementation

### Files to Create
- `backend/src/handlers/intake-editor.ts` (~150 lines)
- `backend/src/lib/services/editor.ts` (~300 lines)
- `backend/src/lib/services/editor.test.ts` (~200 lines)
- S3: `prompts/editor-template.txt` (~100 lines)

### Files to Modify
- `infra/cdk/stacks/ledger-stack.ts` - Add Lambda + EventBridge rule
- `backend/tsup.config.ts` - Add new entry point
- `shared/src/intake.ts` - Add editor fields to IntakeItem type
- `backend/src/lib/config.ts` - Add editor config section

## Design Decisions (Confirmed)

1. **Feed filtering**: Process ALL feeds equally (SEC, DOJ, FTC, GAO)
2. **Relationship publishing**: Auto-publish relationships immediately with cards
3. **Duplicate checking**: Check for existing cards with same title/primary entity, skip if found
4. **Error handling**: If card publish succeeds but relationship publish fails, log error but don't rollback (relationships aren't critical)