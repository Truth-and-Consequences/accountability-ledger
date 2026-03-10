import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RelationshipWithEntities, EntitySummary } from '@ledger/shared';
import { EntityType, RelationshipType } from '@ledger/shared';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import EntityGraph, {
  entityTypeColors,
  relationshipTypeColors,
  relationshipLabels,
} from '../components/EntityGraph';

const entityTypeLabels: Record<string, string> = {
  CORPORATION: 'Corporation',
  AGENCY: 'Agency',
  NONPROFIT: 'Nonprofit',
  VENDOR: 'Vendor',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'Public Official',
};

export default function EntitiesPage() {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [relationships, setRelationships] = useState<RelationshipWithEntities[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState<Set<string>>(
    new Set(Object.values(EntityType))
  );
  const [relTypeFilter, setRelTypeFilter] = useState<Set<string>>(
    new Set(Object.values(RelationshipType))
  );

  // Selected entity detail
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<EntitySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    loadAllRelationships();
  }, []);

  // Load summary when an entity is selected
  useEffect(() => {
    if (selectedEntityId) {
      loadEntitySummary(selectedEntityId);
    } else {
      setSelectedSummary(null);
    }
  }, [selectedEntityId]);

  async function loadAllRelationships() {
    try {
      setLoading(true);
      const allRels: RelationshipWithEntities[] = [];
      let cursor: string | undefined;
      do {
        const result = await api.listPublishedRelationships({
          limit: 100,
          cursor,
        });
        allRels.push(...result.items);
        cursor = result.cursor;
      } while (cursor);
      setRelationships(allRels);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadEntitySummary(entityId: string) {
    try {
      setLoadingSummary(true);
      const data = await api.getEntitySummary(entityId);
      setSelectedSummary(data);
    } catch {
      setSelectedSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  // Apply filters
  const filtered = useMemo(() => {
    return relationships.filter((rel) => {
      if (!relTypeFilter.has(rel.type)) return false;
      const fromMatch = entityTypeFilter.has(rel.fromEntity.type);
      const toMatch = entityTypeFilter.has(rel.toEntity.type);
      if (!fromMatch && !toMatch) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          rel.fromEntity.name.toLowerCase().includes(q) ||
          rel.toEntity.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [relationships, entityTypeFilter, relTypeFilter, search]);

  // Find selected entity info from relationships
  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    for (const rel of relationships) {
      if (rel.fromEntity.entityId === selectedEntityId) return rel.fromEntity;
      if (rel.toEntity.entityId === selectedEntityId) return rel.toEntity;
    }
    return null;
  }, [selectedEntityId, relationships]);

  // Focus entity from search
  const focusEntityId = useMemo(() => {
    if (!search) return selectedEntityId || undefined;
    const q = search.toLowerCase();
    for (const rel of filtered) {
      if (rel.fromEntity.name.toLowerCase().includes(q)) return rel.fromEntity.entityId;
      if (rel.toEntity.name.toLowerCase().includes(q)) return rel.toEntity.entityId;
    }
    return undefined;
  }, [search, filtered, selectedEntityId]);

  const handleNodeClick = useCallback((entityId: string) => {
    setSelectedEntityId((prev) => (prev === entityId ? null : entityId));
  }, []);

  function toggleEntityType(type: string) {
    setEntityTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleRelType(type: string) {
    setRelTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Entity Network</h1>
          <p className="text-gray-600">
            Organizations, agencies, and public officials tracked in the ledger.
          </p>
        </div>
        <span className="text-sm text-gray-500">
          {filtered.length} relationship{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entities..."
          className="input w-full max-w-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-6 mb-4">
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-1">Entity Types</h4>
          <div className="flex flex-wrap gap-1">
            {Object.values(EntityType).map((type) => (
              <button
                key={type}
                onClick={() => toggleEntityType(type)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  entityTypeFilter.has(type)
                    ? 'border-transparent text-white'
                    : 'border-gray-300 text-gray-400 bg-white'
                }`}
                style={
                  entityTypeFilter.has(type)
                    ? { backgroundColor: entityTypeColors[type] || '#6b7280' }
                    : undefined
                }
              >
                {entityTypeLabels[type] || type}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-1">Relationship Types</h4>
          <div className="flex flex-wrap gap-1">
            {Object.values(RelationshipType).map((type) => (
              <button
                key={type}
                onClick={() => toggleRelType(type)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  relTypeFilter.has(type)
                    ? 'border-transparent text-white'
                    : 'border-gray-300 text-gray-400 bg-white'
                }`}
                style={
                  relTypeFilter.has(type)
                    ? { backgroundColor: relationshipTypeColors[type] || '#9ca3af' }
                    : undefined
                }
              >
                {relationshipLabels[type] || type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Graph + Detail panel */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <EntityGraph
            relationships={filtered}
            focusEntityId={focusEntityId}
            height={600}
            onNodeClick={handleNodeClick}
          />
        </div>

        {/* Entity detail sidebar */}
        {selectedEntity && (
          <div className="w-80 flex-shrink-0">
            <div className="card p-4 sticky top-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">
                    {selectedEntity.name}
                  </h3>
                  <span
                    className="inline-block text-xs px-2 py-0.5 rounded-full text-white mt-1"
                    style={{
                      backgroundColor:
                        entityTypeColors[selectedEntity.type] || '#6b7280',
                    }}
                  >
                    {entityTypeLabels[selectedEntity.type] || selectedEntity.type}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedEntityId(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  &times;
                </button>
              </div>

              {/* Summary */}
              {loadingSummary ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
                </div>
              ) : selectedSummary?.narrativeSummary ? (
                <div className="mb-4">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {selectedSummary.narrativeSummary}
                  </p>
                  {selectedSummary.totalClaims > 0 && (
                    <div className="mt-2 flex gap-3 text-xs text-gray-500">
                      <span>{selectedSummary.totalClaims} claims</span>
                      {selectedSummary.totalMonetaryValue > 0 && (
                        <span>
                          $
                          {(selectedSummary.totalMonetaryValue / 100).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-4">No summary available.</p>
              )}

              <button
                onClick={() => navigate(`/entities/${selectedEntityId}`)}
                className="btn-primary w-full text-sm"
              >
                View Full Profile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-6 text-xs text-gray-500">
        <div>
          <span className="font-medium">Nodes:</span>{' '}
          {Object.entries(entityTypeLabels).map(([type, label]) => (
            <span key={type} className="inline-flex items-center gap-1 mr-3">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: entityTypeColors[type] }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {search
              ? 'No entities found matching your search.'
              : 'No relationships to display.'}
          </p>
        </div>
      )}
    </div>
  );
}
