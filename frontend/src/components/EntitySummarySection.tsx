import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EntitySummary, ClaimGroup, ClaimType } from '@ledger/shared';

interface EntitySummarySectionProps {
  summary: EntitySummary;
}

const CLAIM_TYPE_LABELS: Record<ClaimType | 'UNCLASSIFIED', string> = {
  ENFORCEMENT_ACTION: 'Enforcement Actions',
  AUDIT_FINDING: 'Audit Findings',
  DISCLOSURE: 'Disclosures',
  SETTLEMENT: 'Settlements',
  COURT_RULING: 'Court Rulings',
  PENALTY: 'Penalties',
  INJUNCTION: 'Injunctions',
  CONSENT_DECREE: 'Consent Decrees',
  RECALL: 'Recalls',
  WARNING_LETTER: 'Warning Letters',
  INVESTIGATION: 'Investigations',
  UNCLASSIFIED: 'Other Claims',
};

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function ClaimGroupSection({ group }: { group: ClaimGroup }) {
  const [expanded, setExpanded] = useState(false);
  const label = CLAIM_TYPE_LABELS[group.claimType as ClaimType | 'UNCLASSIFIED'] || 'Claims';
  const displayClaims = expanded ? group.claims : group.claims.slice(0, 3);
  const hasMore = group.claims.length > 3;

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900">
          {label}
          <span className="ml-2 text-sm text-gray-500">({group.count})</span>
        </h4>
        {group.totalMonetaryValue && group.totalMonetaryValue > 0 && (
          <span className="text-sm font-medium text-gray-700">
            {formatCurrency(group.totalMonetaryValue)}
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {displayClaims.map((claim) => (
          <li key={claim.cardId} className="text-sm">
            <Link
              to={`/cards/${claim.cardId}`}
              className="text-primary-600 hover:text-primary-800 hover:underline"
            >
              {claim.title}
            </Link>
            <span className="text-gray-500 ml-2">
              ({formatDate(claim.eventDate)})
            </span>
            {claim.monetaryAmount && (
              <span className="text-gray-600 ml-2">
                — {formatCurrency(claim.monetaryAmount.value)}
              </span>
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm text-primary-600 hover:text-primary-800"
        >
          {expanded ? 'Show less' : `Show ${group.claims.length - 3} more`}
        </button>
      )}
    </div>
  );
}

export default function EntitySummarySection({ summary }: EntitySummarySectionProps) {
  if (summary.totalClaims === 0) {
    return (
      <div className="card p-6">
        <p className="text-gray-500 text-center">
          No published claims are currently recorded for this entity.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Narrative Summary */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Summary</h3>
        <p className="text-gray-700 leading-relaxed">{summary.narrativeSummary}</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {summary.totalClaims}
          </div>
          <div className="text-sm text-gray-500">Total Claims</div>
        </div>

        {summary.totalMonetaryValue > 0 && (
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary.totalMonetaryValue)}
            </div>
            <div className="text-sm text-gray-500">Monetary Impact</div>
          </div>
        )}

        <div className="card p-4 text-center">
          <div className="text-lg font-bold text-gray-900">
            {formatDate(summary.dateRange.earliest)}
            {summary.dateRange.earliest !== summary.dateRange.latest && (
              <>
                <span className="mx-1">—</span>
                {formatDate(summary.dateRange.latest)}
              </>
            )}
          </div>
          <div className="text-sm text-gray-500">Date Range</div>
        </div>
      </div>

      {/* Claim Groups */}
      {summary.claimGroups.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Claims by Type
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.claimGroups.map((group) => (
              <ClaimGroupSection
                key={group.claimType}
                group={group}
              />
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(summary.categoryBreakdown).length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Claims by Category
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.categoryBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([category, count]) => (
                <span
                  key={category}
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700"
                >
                  {category}: {count}
                </span>
              ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        Generated {new Date(summary.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}
