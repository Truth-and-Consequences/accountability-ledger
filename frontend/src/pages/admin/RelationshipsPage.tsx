import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type {
  RelationshipWithEntities,
  Entity,
  RelationshipType,
  RelationshipStatus,
} from '@ledger/shared';
import { api } from '../../lib/api';

const RELATIONSHIP_TYPES: { value: RelationshipType; label: string }[] = [
  { value: 'OWNS', label: 'Owns' },
  { value: 'CONTROLS', label: 'Controls' },
  { value: 'SUBSIDIARY_OF', label: 'Subsidiary Of' },
  { value: 'ACQUIRED', label: 'Acquired' },
  { value: 'DIVESTED', label: 'Divested' },
  { value: 'JV_PARTNER', label: 'JV Partner' },
  { value: 'AFFILIATED', label: 'Affiliated' },
  { value: 'PARENT_OF', label: 'Parent Of' },
  { value: 'CONTRACTOR_TO', label: 'Contractor To' },
  { value: 'REGULATED_BY', label: 'Regulated By' },
  { value: 'BOARD_INTERLOCK', label: 'Board Interlock' },
  { value: 'LOBBIED_BY', label: 'Lobbied By' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_OPTIONS: { value: RelationshipStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'RETRACTED', label: 'Retracted' },
];

function getStatusBadgeClass(status: RelationshipStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'badge-draft';
    case 'PUBLISHED':
      return 'badge-published';
    case 'RETRACTED':
      return 'badge-retracted';
    default:
      return 'badge-secondary';
  }
}

export default function RelationshipsPage() {
  const [relationships, setRelationships] = useState<RelationshipWithEntities[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RelationshipStatus | 'ALL'>('ALL');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<RelationshipWithEntities | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fromEntityId, setFromEntityId] = useState('');
  const [toEntityId, setToEntityId] = useState('');
  const [relationType, setRelationType] = useState<RelationshipType>('AFFILIATED');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ownershipPercentage, setOwnershipPercentage] = useState('');
  const [sourceRefs, setSourceRefs] = useState('');

  // Retract modal state
  const [retractingId, setRetractingId] = useState<string | null>(null);
  const [retractReason, setRetractReason] = useState('');

  useEffect(() => {
    loadRelationships();
  }, [statusFilter]);

  useEffect(() => {
    loadEntities();
  }, []);

  async function loadRelationships(loadMore = false) {
    try {
      if (!loadMore) {
        setLoading(true);
        setCursor(undefined);
      }
      setError(null);

      const result = await api.listAdminRelationships({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit: 50,
        cursor: loadMore ? cursor : undefined,
      });

      if (loadMore) {
        setRelationships((prev) => [...prev, ...result.items]);
      } else {
        setRelationships(result.items);
      }
      setHasMore(result.hasMore);
      setCursor(result.cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load relationships');
    } finally {
      setLoading(false);
    }
  }

  async function loadEntities() {
    try {
      const result = await api.listEntities({ limit: 100 });
      setEntities(result.items);
    } catch (err) {
      console.error('Failed to load entities:', err);
    }
  }

  function openCreateModal() {
    setEditingRelationship(null);
    setFromEntityId('');
    setToEntityId('');
    setRelationType('AFFILIATED');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setOwnershipPercentage('');
    setSourceRefs('');
    setShowModal(true);
  }

  function openEditModal(rel: RelationshipWithEntities) {
    setEditingRelationship(rel);
    setFromEntityId(rel.fromEntityId);
    setToEntityId(rel.toEntityId);
    setRelationType(rel.type);
    setDescription(rel.description || '');
    setStartDate(rel.startDate || '');
    setEndDate(rel.endDate || '');
    setOwnershipPercentage(rel.ownershipPercentage?.toString() || '');
    setSourceRefs(rel.sourceRefs.join(', '));
    setShowModal(true);
  }

  async function handleSave() {
    if (!fromEntityId || !toEntityId) {
      alert('Please select both entities');
      return;
    }

    if (fromEntityId === toEntityId) {
      alert('From and To entities must be different');
      return;
    }

    try {
      setSaving(true);
      const sourceRefList = sourceRefs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const data = {
        fromEntityId,
        toEntityId,
        type: relationType,
        description: description || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        ownershipPercentage: ownershipPercentage
          ? parseFloat(ownershipPercentage)
          : undefined,
        sourceRefs: sourceRefList,
      };

      if (editingRelationship) {
        await api.updateRelationship(editingRelationship.relationshipId, {
          type: relationType,
          description: description || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          ownershipPercentage: ownershipPercentage
            ? parseFloat(ownershipPercentage)
            : undefined,
          sourceRefs: sourceRefList,
        });
      } else {
        await api.createRelationship(data);
      }

      setShowModal(false);
      loadRelationships();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save relationship');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(relationshipId: string) {
    if (!confirm('Publish this relationship? It will be visible publicly.')) return;

    try {
      await api.publishRelationship(relationshipId);
      loadRelationships();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish relationship');
    }
  }

  async function handleRetract() {
    if (!retractingId || !retractReason.trim()) {
      alert('Please provide a reason for retraction');
      return;
    }

    try {
      await api.retractRelationship(retractingId, retractReason);
      setRetractingId(null);
      setRetractReason('');
      loadRelationships();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retract relationship');
    }
  }

  function formatDate(iso?: string): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getRelationshipLabel(type: RelationshipType): string {
    const found = RELATIONSHIP_TYPES.find((t) => t.value === type);
    return found?.label || type;
  }

  if (loading && relationships.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Relationships</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as RelationshipStatus | 'ALL')
              }
              className="input py-1 px-2 text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button onClick={openCreateModal} className="btn-primary">
            New Relationship
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {relationships.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No relationships found.</p>
          <button onClick={openCreateModal} className="btn-primary mt-4">
            Create First Relationship
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {relationships.map((rel) => (
            <div key={rel.relationshipId} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`badge ${getStatusBadgeClass(rel.status)}`}>
                      {rel.status}
                    </span>
                    <span className="badge badge-primary">
                      {getRelationshipLabel(rel.type)}
                    </span>
                    {rel.ownershipPercentage !== undefined && (
                      <span className="badge badge-secondary">
                        {rel.ownershipPercentage}%
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">
                    <Link
                      to={`/entities/${rel.fromEntityId}`}
                      className="text-primary-600 hover:underline"
                    >
                      {rel.fromEntity.name}
                    </Link>
                    <span className="text-gray-400 mx-2">→</span>
                    <Link
                      to={`/entities/${rel.toEntityId}`}
                      className="text-primary-600 hover:underline"
                    >
                      {rel.toEntity.name}
                    </Link>
                  </h2>
                  {rel.description && (
                    <p className="text-gray-600 text-sm mb-2">{rel.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {rel.startDate && <span>Start: {formatDate(rel.startDate)}</span>}
                    {rel.endDate && <span>End: {formatDate(rel.endDate)}</span>}
                    <span>Created: {formatDate(rel.createdAt)}</span>
                    {rel.sourceRefs.length > 0 && (
                      <span>{rel.sourceRefs.length} source(s)</span>
                    )}
                  </div>
                  {rel.status === 'RETRACTED' && rel.retractionReason && (
                    <div className="mt-2 text-sm text-red-600">
                      <strong>Retracted:</strong> {rel.retractionReason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {rel.status === 'DRAFT' && (
                    <>
                      <button
                        onClick={() => openEditModal(rel)}
                        className="btn-secondary text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handlePublish(rel.relationshipId)}
                        className="btn-primary text-sm bg-green-600 hover:bg-green-700"
                        title={
                          rel.sourceRefs.length === 0
                            ? 'Add sources before publishing'
                            : undefined
                        }
                      >
                        Publish
                      </button>
                    </>
                  )}
                  {rel.status === 'PUBLISHED' && (
                    <button
                      onClick={() => {
                        setRetractingId(rel.relationshipId);
                        setRetractReason('');
                      }}
                      className="btn-secondary text-sm text-red-600 hover:text-red-700"
                    >
                      Retract
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center mt-8">
          <button onClick={() => loadRelationships(true)} className="btn-secondary">
            Load More
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingRelationship ? 'Edit Relationship' : 'New Relationship'}
              </h2>

              {/* Entity Selection */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Entity *
                  </label>
                  <select
                    value={fromEntityId}
                    onChange={(e) => setFromEntityId(e.target.value)}
                    className="input w-full"
                    disabled={!!editingRelationship}
                  >
                    <option value="">Select entity...</option>
                    {entities.map((entity) => (
                      <option key={entity.entityId} value={entity.entityId}>
                        {entity.name} ({entity.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    To Entity *
                  </label>
                  <select
                    value={toEntityId}
                    onChange={(e) => setToEntityId(e.target.value)}
                    className="input w-full"
                    disabled={!!editingRelationship}
                  >
                    <option value="">Select entity...</option>
                    {entities.map((entity) => (
                      <option key={entity.entityId} value={entity.entityId}>
                        {entity.name} ({entity.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Relationship Type */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relationship Type *
                </label>
                <select
                  value={relationType}
                  onChange={(e) => setRelationType(e.target.value as RelationshipType)}
                  className="input w-full"
                >
                  {RELATIONSHIP_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input w-full h-24"
                  placeholder="Optional description of the relationship..."
                />
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>

              {/* Ownership Percentage (for OWNS/CONTROLS) */}
              {(relationType === 'OWNS' || relationType === 'CONTROLS') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ownership Percentage
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={ownershipPercentage}
                    onChange={(e) => setOwnershipPercentage(e.target.value)}
                    className="input w-full"
                    placeholder="e.g., 51.5"
                  />
                </div>
              )}

              {/* Source References */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source IDs (comma-separated)
                </label>
                <input
                  type="text"
                  value={sourceRefs}
                  onChange={(e) => setSourceRefs(e.target.value)}
                  className="input w-full"
                  placeholder="e.g., src_abc123, src_def456"
                />
                <p className="text-xs text-gray-500 mt-1">
                  At least one verified source is required to publish
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingRelationship ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Retract Modal */}
      {retractingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Retract Relationship
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Please provide a reason for retracting this relationship. This action
                cannot be undone.
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason *
                </label>
                <textarea
                  value={retractReason}
                  onChange={(e) => setRetractReason(e.target.value)}
                  className="input w-full h-24"
                  placeholder="Explain why this relationship is being retracted..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setRetractingId(null);
                    setRetractReason('');
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={handleRetract} className="btn-danger">
                  Retract
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
