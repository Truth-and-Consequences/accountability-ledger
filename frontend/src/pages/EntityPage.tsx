import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type {
  Entity,
  EvidenceCard as EvidenceCardType,
  RelationshipWithEntities,
  EntitySummary,
} from '@ledger/shared';
import { api } from '../lib/api';
import EvidenceCard from '../components/EvidenceCard';
import EntitySummarySection from '../components/EntitySummarySection';
import EntityGraph from '../components/EntityGraph';

const entityTypes: Record<string, string> = {
  CORPORATION: 'Corporation',
  AGENCY: 'Government Agency',
  NONPROFIT: 'Nonprofit Organization',
  VENDOR: 'Vendor',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'Public Official',
};


export default function EntityPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const navigate = useNavigate();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [cards, setCards] = useState<EvidenceCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  // Relationships state
  const [relationships, setRelationships] = useState<RelationshipWithEntities[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'cards' | 'relationships'>('summary');

  // Summary state
  const [summary, setSummary] = useState<EntitySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (entityId) {
      loadEntity();
      loadCards();
      loadRelationships();
      loadSummary();
    }
  }, [entityId]);

  async function loadEntity() {
    try {
      const data = await api.getEntity(entityId!);
      setEntity(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity');
    }
  }

  async function loadRelationships() {
    try {
      setLoadingRelationships(true);
      const result = await api.getEntityRelationships(entityId!, { limit: 50 });
      setRelationships(result.items);
    } catch (err) {
      console.error('Failed to load relationships:', err);
    } finally {
      setLoadingRelationships(false);
    }
  }

  async function loadSummary() {
    try {
      setLoadingSummary(true);
      const data = await api.getEntitySummary(entityId!);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadCards(loadMore = false) {
    try {
      setLoading(true);

      const result = await api.getEntityCards(entityId!, {
        cursor: loadMore ? cursor : undefined,
        limit: 20,
      });

      if (loadMore) {
        setCards((prev) => [...prev, ...result.items]);
      } else {
        setCards(result.items);
      }

      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (err) {
      // Don't override entity error
      if (!error) {
        setError(err instanceof Error ? err.message : 'Failed to load cards');
      }
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
        <p className="text-gray-600 mb-4">{error}</p>
        <Link to="/entities" className="btn-primary">
          Back to Entities
        </Link>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <Link to="/entities" className="text-primary-600 hover:text-primary-800">
          Entities
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{entity.name}</span>
      </nav>

      {/* Entity header */}
      <div className="card p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {entity.name}
            </h1>
            <p className="text-gray-600 mb-4">
              {entityTypes[entity.type] || entity.type}
            </p>

            {entity.aliases && entity.aliases.length > 0 && (
              <p className="text-sm text-gray-500 mb-2">
                <strong>Also known as:</strong> {entity.aliases.join(', ')}
              </p>
            )}

            {entity.website && (
              <a
                href={entity.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                {entity.website}
              </a>
            )}

            {entity.identifiers && (
              <div className="mt-4 text-sm text-gray-500">
                {entity.identifiers.ticker && (
                  <span className="mr-4">Ticker: {entity.identifiers.ticker}</span>
                )}
                {entity.identifiers.ein && (
                  <span className="mr-4">EIN: {entity.identifiers.ein}</span>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="text-right space-y-2">
            <div>
              <div className="text-3xl font-bold text-gray-900">
                {cards.length}
              </div>
              <div className="text-sm text-gray-500">Evidence Cards</div>
            </div>
            {relationships.length > 0 && (
              <div>
                <div className="text-xl font-bold text-gray-900">
                  {relationships.length}
                </div>
                <div className="text-sm text-gray-500">Relationships</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('summary')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'summary'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('cards')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'cards'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Evidence Cards ({cards.length})
          </button>
          <button
            onClick={() => setActiveTab('relationships')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'relationships'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Relationships ({relationships.length})
          </button>
        </nav>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <>
          {loadingSummary ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : summary ? (
            <EntitySummarySection summary={summary} />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">Unable to load summary.</p>
            </div>
          )}
        </>
      )}

      {/* Cards Tab */}
      {activeTab === 'cards' && (
        <>
          <div className="space-y-4">
            {cards.map((card) => (
              <EvidenceCard
                key={card.cardId}
                card={card}
                showEntities={false}
              />
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          )}

          {/* Empty state */}
          {!loading && cards.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No evidence cards found for this entity.</p>
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="flex justify-center mt-8">
              <button onClick={() => loadCards(true)} className="btn-secondary">
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {/* Relationships Tab */}
      {activeTab === 'relationships' && (
        <>
          {loadingRelationships ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Entity Network
                </h3>
                <span className="text-sm text-gray-500">
                  {relationships.length} relationship{relationships.length !== 1 ? 's' : ''}
                </span>
              </div>
              <EntityGraph
                relationships={relationships}
                focusEntityId={entityId}
                height={500}
                onNodeClick={(id) => navigate(`/entities/${id}`)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
