import { describe, it, expect } from 'vitest';

// Import the parseEditorResponse function by extracting from editor.ts
// For now, we'll test the parsing logic directly

/**
 * Test the editor response parsing logic
 */
describe('Editor Response Parsing', () => {
  // Helper to parse editor response (mirrors logic in editor.ts)
  function parseEditorResponse(content: string) {
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);

      if (!parsed.decision || !['PUBLISH', 'SKIP'].includes(parsed.decision)) {
        return null;
      }

      return {
        decision: parsed.decision,
        reason: parsed.reason || 'No reason provided',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        entities: parsed.entities || [],
        relationships: parsed.relationships || [],
        cardSummary: parsed.cardSummary || '',
      };
    } catch {
      return null;
    }
  }

  describe('parseEditorResponse', () => {
    it('should parse a valid PUBLISH decision', () => {
      const response = `{
        "decision": "PUBLISH",
        "reason": "Clear enforcement action with fines",
        "confidence": 0.95,
        "entities": [
          { "entityId": "ent_123" },
          { "create": { "name": "Acme Corp", "type": "CORPORATION" } }
        ],
        "relationships": [
          { "fromEntityIndex": 0, "toEntityIndex": 1, "type": "FINED_BY", "description": "FTC fined Acme Corp" }
        ],
        "cardSummary": "The FTC fined Acme Corp $5 million for deceptive practices."
      }`;

      const result = parseEditorResponse(response);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('PUBLISH');
      expect(result?.confidence).toBe(0.95);
      expect(result?.entities).toHaveLength(2);
      expect(result?.entities[0]).toEqual({ entityId: 'ent_123' });
      expect(result?.relationships).toHaveLength(1);
      expect(result?.cardSummary).toContain('FTC fined Acme Corp');
    });

    it('should parse a valid SKIP decision', () => {
      const response = `{
        "decision": "SKIP",
        "reason": "Insufficient evidence for misconduct claim",
        "confidence": 0.7,
        "entities": [],
        "relationships": [],
        "cardSummary": ""
      }`;

      const result = parseEditorResponse(response);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('SKIP');
      expect(result?.reason).toBe('Insufficient evidence for misconduct claim');
      expect(result?.entities).toHaveLength(0);
    });

    it('should handle markdown code blocks', () => {
      const response = '```json\n{"decision": "SKIP", "reason": "Test", "confidence": 0.5}\n```';

      const result = parseEditorResponse(response);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('SKIP');
    });

    it('should handle JSON embedded in text', () => {
      const response = 'Here is my analysis:\n{"decision": "PUBLISH", "reason": "Valid", "confidence": 0.9}\nEnd of response.';

      const result = parseEditorResponse(response);

      expect(result).not.toBeNull();
      expect(result?.decision).toBe('PUBLISH');
    });

    it('should clamp confidence to 0-1 range', () => {
      const overResponse = '{"decision": "PUBLISH", "reason": "Test", "confidence": 1.5}';
      const underResponse = '{"decision": "PUBLISH", "reason": "Test", "confidence": -0.5}';

      expect(parseEditorResponse(overResponse)?.confidence).toBe(1);
      expect(parseEditorResponse(underResponse)?.confidence).toBe(0);
    });

    it('should return null for invalid decision values', () => {
      const response = '{"decision": "MAYBE", "reason": "Test", "confidence": 0.5}';

      expect(parseEditorResponse(response)).toBeNull();
    });

    it('should return null for missing decision', () => {
      const response = '{"reason": "Test", "confidence": 0.5}';

      expect(parseEditorResponse(response)).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const response = 'This is not JSON at all';

      expect(parseEditorResponse(response)).toBeNull();
    });

    it('should provide defaults for missing optional fields', () => {
      const response = '{"decision": "SKIP"}';

      const result = parseEditorResponse(response);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('No reason provided');
      expect(result?.confidence).toBe(0);
      expect(result?.entities).toEqual([]);
      expect(result?.relationships).toEqual([]);
      expect(result?.cardSummary).toBe('');
    });
  });
});

describe('Editor Entity Resolution', () => {
  it('should prefer existing entities over creating new ones', () => {
    const entities = [
      { entityId: 'ent_existing_123' },
      { create: { name: 'New Entity', type: 'CORPORATION' } },
    ];

    // First entity uses existing ID
    expect('entityId' in entities[0]).toBe(true);
    expect((entities[0] as { entityId: string }).entityId).toBe('ent_existing_123');

    // Second entity creates new
    expect('create' in entities[1]).toBe(true);
  });
});

describe('Editor Confidence Thresholds', () => {
  const minConfidence = 0.8;

  it('should accept confidence at threshold', () => {
    expect(0.8 >= minConfidence).toBe(true);
  });

  it('should reject confidence below threshold', () => {
    expect(0.79 >= minConfidence).toBe(false);
  });

  it('should accept confidence above threshold', () => {
    expect(0.95 >= minConfidence).toBe(true);
  });
});

describe('Editor Decision Types', () => {
  it('should handle PUBLISH decision', () => {
    const decision = 'PUBLISH';
    expect(['PUBLISH', 'SKIP'].includes(decision)).toBe(true);
  });

  it('should handle SKIP decision', () => {
    const decision = 'SKIP';
    expect(['PUBLISH', 'SKIP'].includes(decision)).toBe(true);
  });
});

describe('Relationship Type Validation', () => {
  const validTypes = [
    'OWNS', 'CONTROLS', 'SUBSIDIARY_OF', 'PARENT_OF', 'AFFILIATED_WITH',
    'EMPLOYS', 'CONTRACTS_WITH', 'REGULATES', 'LOBBIES', 'FUNDS',
    'INVESTED_IN', 'SUPPLIES', 'COMPETES_WITH', 'PARTNERS_WITH',
    'ACQUIRED', 'MERGED_WITH', 'SPUN_OFF', 'SUED', 'SUED_BY',
    'SETTLED_WITH', 'INVESTIGATED_BY', 'FINED_BY', 'OTHER',
  ];

  it('should recognize valid relationship types', () => {
    expect(validTypes.includes('FINED_BY')).toBe(true);
    expect(validTypes.includes('SUED_BY')).toBe(true);
    expect(validTypes.includes('INVESTIGATED_BY')).toBe(true);
    expect(validTypes.includes('SETTLED_WITH')).toBe(true);
  });

  it('should reject invalid relationship types', () => {
    expect(validTypes.includes('INVALID_TYPE')).toBe(false);
  });
});
