import type { ClaimGroup, ClaimType } from '@ledger/shared';

/**
 * Human-readable labels for claim types
 */
const CLAIM_TYPE_LABELS: Record<ClaimType | 'UNCLASSIFIED', string> = {
  ENFORCEMENT_ACTION: 'enforcement actions',
  AUDIT_FINDING: 'audit findings',
  DISCLOSURE: 'disclosures',
  SETTLEMENT: 'settlements',
  COURT_RULING: 'court rulings',
  PENALTY: 'penalties',
  INJUNCTION: 'injunctions',
  CONSENT_DECREE: 'consent decrees',
  RECALL: 'recalls',
  WARNING_LETTER: 'warning letters',
  INVESTIGATION: 'investigations',
  UNCLASSIFIED: 'other claims',
};

/**
 * Format cents to currency string (e.g., "$1,234,567.89")
 */
export function formatCurrency(cents: number, currency = 'USD'): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/**
 * Format a date range for display
 */
export function formatDateRange(earliest: string, latest: string): string {
  if (earliest === latest) {
    return formatDate(earliest);
  }
  return `${formatDate(earliest)} to ${formatDate(latest)}`;
}

/**
 * Format a single ISO date for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Generate a deterministic narrative summary from claim data.
 * Uses template-driven text generation (no LLM).
 */
export function generateNarrativeSummary(
  entityName: string,
  claimGroups: ClaimGroup[],
  totalClaims: number,
  totalMonetaryValue: number,
  dateRange: { earliest: string; latest: string }
): string {
  if (totalClaims === 0) {
    return `No published claims are currently recorded for ${entityName}.`;
  }

  const parts: string[] = [];

  // Opening sentence
  const dateRangeText = formatDateRange(dateRange.earliest, dateRange.latest);
  parts.push(
    `${entityName} has ${totalClaims} documented claim${totalClaims === 1 ? '' : 's'} spanning ${dateRangeText}.`
  );

  // Monetary impact (if any)
  if (totalMonetaryValue > 0) {
    parts.push(
      `Total documented monetary impact: ${formatCurrency(totalMonetaryValue)}.`
    );
  }

  // Claim type breakdown
  const significantGroups = claimGroups.filter((g) => g.count > 0);
  if (significantGroups.length > 0) {
    const breakdownParts = significantGroups.map((g) => {
      const label = CLAIM_TYPE_LABELS[g.claimType as ClaimType | 'UNCLASSIFIED'] || 'claims';
      const monetaryNote =
        g.totalMonetaryValue && g.totalMonetaryValue > 0
          ? ` (${formatCurrency(g.totalMonetaryValue)})`
          : '';
      return `${g.count} ${label}${monetaryNote}`;
    });

    if (breakdownParts.length === 1) {
      parts.push(`This includes ${breakdownParts[0]}.`);
    } else if (breakdownParts.length === 2) {
      parts.push(`This includes ${breakdownParts[0]} and ${breakdownParts[1]}.`);
    } else {
      const last = breakdownParts.pop();
      parts.push(`This includes ${breakdownParts.join(', ')}, and ${last}.`);
    }
  }

  return parts.join(' ');
}

/**
 * Get the human-readable label for a claim type
 */
export function getClaimTypeLabel(claimType: ClaimType | 'UNCLASSIFIED'): string {
  return CLAIM_TYPE_LABELS[claimType] || 'claims';
}
