import type { EvidenceCard, EntitySummary, ClaimGroup, ClaimType } from '@ledger/shared';
import { CardStatus } from '@ledger/shared';
import { getEntity } from './entities.js';
import { listEntityCards } from './cards.js';
import { generateNarrativeSummary } from '../templates/summary.js';
import type { EntitySummaryQueryInput } from '../validation.js';

/**
 * Get an entity summary (Fact Pack) with grouped claims and narrative.
 * Only includes PUBLISHED cards.
 */
export async function getEntitySummary(
  entityId: string,
  options?: EntitySummaryQueryInput
): Promise<EntitySummary> {
  // 1. Fetch entity
  const entity = await getEntity(entityId);

  // 2. Fetch all PUBLISHED cards for entity (paginate to get all)
  let allCards: EvidenceCard[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const result = await listEntityCards(entityId, {
      limit: 100,
      cursor,
      status: CardStatus.PUBLISHED,
    });
    allCards = allCards.concat(result.items);
    cursor = result.cursor;
    hasMore = result.hasMore;
  }

  // 3. Filter by options
  let filteredCards = allCards;

  if (options?.claimTypes && options.claimTypes.length > 0) {
    filteredCards = filteredCards.filter(
      (card) => card.claimType && options.claimTypes!.includes(card.claimType)
    );
  }

  if (options?.dateFrom) {
    filteredCards = filteredCards.filter(
      (card) => card.eventDate >= options.dateFrom!
    );
  }

  if (options?.dateTo) {
    filteredCards = filteredCards.filter(
      (card) => card.eventDate <= options.dateTo!
    );
  }

  // 4. Group by claimType
  const claimGroups = groupByClaimType(filteredCards);

  // 5. Compute aggregates
  const totalClaims = filteredCards.length;
  const totalMonetaryValue = computeTotalMonetaryValue(filteredCards);
  const dateRange = computeDateRange(filteredCards);
  const categoryBreakdown = computeCategoryBreakdown(filteredCards);

  // 6. Generate deterministic narrative
  const narrativeSummary = generateNarrativeSummary(
    entity.name,
    claimGroups,
    totalClaims,
    totalMonetaryValue,
    dateRange
  );

  return {
    entityId: entity.entityId,
    entityName: entity.name,
    claimGroups,
    totalClaims,
    totalMonetaryValue,
    dateRange,
    categoryBreakdown,
    narrativeSummary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Group cards by their claimType field.
 * Cards without claimType are grouped under a special key.
 */
function groupByClaimType(cards: EvidenceCard[]): ClaimGroup[] {
  const groups = new Map<ClaimType | 'UNCLASSIFIED', EvidenceCard[]>();

  for (const card of cards) {
    const key = card.claimType || ('UNCLASSIFIED' as const);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(card);
  }

  // Convert to ClaimGroup array, sorted by eventDate (newest first) within each group
  const result: ClaimGroup[] = [];

  for (const [claimType, claimCards] of groups) {
    // Sort by eventDate descending
    const sortedCards = claimCards.sort((a, b) =>
      b.eventDate.localeCompare(a.eventDate)
    );

    const totalMonetaryValue = computeTotalMonetaryValue(sortedCards);

    result.push({
      claimType: claimType as ClaimType,
      claims: sortedCards,
      count: sortedCards.length,
      totalMonetaryValue: totalMonetaryValue > 0 ? totalMonetaryValue : undefined,
    });
  }

  // Sort groups by count (most claims first)
  return result.sort((a, b) => b.count - a.count);
}

/**
 * Compute total monetary value across all cards (in cents).
 */
function computeTotalMonetaryValue(cards: EvidenceCard[]): number {
  return cards.reduce((total, card) => {
    if (card.monetaryAmount?.value) {
      return total + card.monetaryAmount.value;
    }
    return total;
  }, 0);
}

/**
 * Compute date range from cards.
 */
function computeDateRange(cards: EvidenceCard[]): { earliest: string; latest: string } {
  if (cards.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    return { earliest: today, latest: today };
  }

  const dates = cards.map((c) => c.eventDate).sort();
  return {
    earliest: dates[0],
    latest: dates[dates.length - 1],
  };
}

/**
 * Compute category breakdown (count by CardCategory).
 */
function computeCategoryBreakdown(cards: EvidenceCard[]): Record<string, number> {
  const breakdown: Record<string, number> = {};

  for (const card of cards) {
    breakdown[card.category] = (breakdown[card.category] || 0) + 1;
  }

  return breakdown;
}
