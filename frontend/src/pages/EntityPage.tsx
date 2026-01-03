import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type {
  Entity,
  EvidenceCard as EvidenceCardType,
  RelationshipWithEntities,
  OwnershipTreeResponse,
  OwnershipNode,
} from '@ledger/shared';
import { api } from '../lib/api';
import EvidenceCard from '../components/EvidenceCard';

const entityTypes: Record<string, string> = {
  CORPORATION: 'Corporation',
  AGENCY: 'Government Agency',
  NONPROFIT: 'Nonprofit Organization',
  VENDOR: 'Vendor',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'Public Official',
};

const relationshipLabels: Record<string, string> = {
  OWNS: 'Owns',
  CONTROLS: 'Controls',
  SUBSIDIARY_OF: 'Subsidiary Of',
  ACQUIRED: 'Acquired',
  DIVESTED: 'Divested',
  JV_PARTNER: 'JV Partner',
  AFFILIATED: 'Affiliated',
  PARENT_OF: 'Parent Of',
  CONTRACTOR_TO: 'Contractor To',
  REGULATED_BY: 'Regulated By',
  BOARD_INTERLOCK: 'Board Interlock',
  LOBBIED_BY: 'Lobbied By',
  OTHER: 'Other',
};

export default function EntityPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [cards, setCards] = useState<EvidenceCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  // Relationships state
  const [relationships, setRelationships] = useState<RelationshipWithEntities[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [ownershipTree, setOwnershipTree] = useState<OwnershipTreeResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'cards' | 'relationships'>('cards');

  useEffect(() => {
    if (entityId) {
      loadEntity();
      loadCards();
      loadRelationships();
      loadOwnershipTree();
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

  async function loadOwnershipTree() {
    try {
      const tree = await api.getOwnershipTree(entityId!, {
        direction: 'both',
        maxDepth: 4,
      });
      setOwnershipTree(tree);
    } catch (err) {
      console.error('Failed to load ownership tree:', err);
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
          {/* Ownership Tree Visualization */}
          {ownershipTree && (ownershipTree.root.children?.length || ownershipTree.root.parents?.length) && (
            <div className="card p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Ownership Structure
              </h3>
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Parent entities (entities that own this one) */}
                  {ownershipTree.root.parents && ownershipTree.root.parents.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Owned By</h4>
                      <div className="space-y-2">
                        {ownershipTree.root.parents.map((parent: OwnershipNode) => (
                          <div
                            key={parent.entityId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="text-gray-400">↑</span>
                            <Link
                              to={`/entities/${parent.entityId}`}
                              className="text-primary-600 hover:underline font-medium"
                            >
                              {parent.name}
                            </Link>
                            <span className="text-gray-500">({parent.type})</span>
                            {parent.relationship?.ownershipPercentage !== undefined && (
                              <span className="badge badge-secondary text-xs">
                                {parent.relationship.ownershipPercentage}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current entity */}
                  <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 mb-6 text-center">
                    <span className="font-semibold text-primary-900">
                      {ownershipTree.root.name}
                    </span>
                  </div>

                  {/* Child entities (entities owned by this one) */}
                  {ownershipTree.root.children && ownershipTree.root.children.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Owns</h4>
                      <div className="space-y-2">
                        {ownershipTree.root.children.map((child: OwnershipNode) => (
                          <div
                            key={child.entityId}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="text-gray-400">↓</span>
                            <Link
                              to={`/entities/${child.entityId}`}
                              className="text-primary-600 hover:underline font-medium"
                            >
                              {child.name}
                            </Link>
                            <span className="text-gray-500">({child.type})</span>
                            {child.relationship?.ownershipPercentage !== undefined && (
                              <span className="badge badge-secondary text-xs">
                                {child.relationship.ownershipPercentage}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {ownershipTree.maxDepthReached && (
                    <p className="text-xs text-gray-500 mt-4 text-center">
                      Note: Tree depth limited for display
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Relationships List */}
          {loadingRelationships ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : relationships.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No relationships found for this entity.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {relationships.map((rel) => {
                const isFrom = rel.fromEntityId === entityId;
                const otherEntity = isFrom ? rel.toEntity : rel.fromEntity;
                const direction = isFrom ? '→' : '←';

                return (
                  <div key={rel.relationshipId} className="card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="badge badge-primary">
                            {relationshipLabels[rel.type] || rel.type}
                          </span>
                          {rel.ownershipPercentage !== undefined && (
                            <span className="badge badge-secondary">
                              {rel.ownershipPercentage}%
                            </span>
                          )}
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-600">{entity.name}</span>
                          <span className="mx-2 text-gray-400">{direction}</span>
                          <Link
                            to={`/entities/${otherEntity.entityId}`}
                            className="text-primary-600 hover:underline font-medium"
                          >
                            {otherEntity.name}
                          </Link>
                          <span className="text-gray-500 ml-1">
                            ({otherEntity.type})
                          </span>
                        </div>
                        {rel.description && (
                          <p className="text-sm text-gray-600 mt-1">{rel.description}</p>
                        )}
                        <div className="flex gap-4 text-xs text-gray-500 mt-2">
                          {rel.startDate && <span>From: {rel.startDate}</span>}
                          {rel.endDate && <span>To: {rel.endDate}</span>}
                          {rel.sourceRefs.length > 0 && (
                            <span>{rel.sourceRefs.length} source(s)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
