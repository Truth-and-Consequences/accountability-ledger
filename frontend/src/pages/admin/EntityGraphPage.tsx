import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RelationshipWithEntities } from '@ledger/shared';
import { EntityType, RelationshipType } from '@ledger/shared';
import { api } from '../../lib/api';
import { useToast } from '../../components/Toast';
import EntityGraph, {
  entityTypeColors,
  relationshipTypeColors,
  relationshipLabels,
} from '../../components/EntityGraph';

const entityTypeLabels: Record<string, string> = {
  CORPORATION: 'Corporation',
  AGENCY: 'Agency',
  NONPROFIT: 'Nonprofit',
  VENDOR: 'Vendor',
  INDIVIDUAL_PUBLIC_OFFICIAL: 'Public Official',
};

export default function EntityGraphPage() {
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

  useEffect(() => {
    loadAllRelationships();
  }, []);

  async function loadAllRelationships() {
    try {
      setLoading(true);
      const allRels: RelationshipWithEntities[] = [];
      let cursor: string | undefined;
      do {
        const result = await api.listAdminRelationships({
          status: 'PUBLISHED',
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

  // Apply filters
  const filtered = useMemo(() => {
    return relationships.filter((rel) => {
      // Relationship type filter
      if (!relTypeFilter.has(rel.type)) return false;
      // Entity type filter — at least one entity must match
      const fromMatch = entityTypeFilter.has(rel.fromEntity.type);
      const toMatch = entityTypeFilter.has(rel.toEntity.type);
      if (!fromMatch && !toMatch) return false;
      // Search filter
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

  // Find focus entity from search
  const focusEntityId = useMemo(() => {
    if (!search) return undefined;
    const q = search.toLowerCase();
    for (const rel of filtered) {
      if (rel.fromEntity.name.toLowerCase().includes(q)) return rel.fromEntity.entityId;
      if (rel.toEntity.name.toLowerCase().includes(q)) return rel.toEntity.entityId;
    }
    return undefined;
  }, [search, filtered]);

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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Entity Network</h1>
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

      {/* Graph */}
      <EntityGraph
        relationships={filtered}
        focusEntityId={focusEntityId}
        height={650}
        onNodeClick={(id) => navigate(`/entities/${id}`)}
      />

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
    </div>
  );
}
