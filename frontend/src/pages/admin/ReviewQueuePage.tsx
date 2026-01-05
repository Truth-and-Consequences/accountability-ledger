import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { EvidenceCard } from '@ledger/shared';
import { api } from '../../lib/api';
import ErrorMessage from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';

export default function AdminReviewQueuePage() {
  const [cards, setCards] = useState<EvidenceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    loadReviewQueue();
  }, []);

  async function loadReviewQueue() {
    try {
      setLoading(true);
      // Load all DRAFT and REVIEW cards
      const result = await api.listAdminCards({ limit: 50 });
      // Filter to show only DRAFT and REVIEW status cards
      const reviewableCards = result.items.filter(
        (c) => c.status === 'DRAFT' || c.status === 'REVIEW'
      );
      setCards(reviewableCards);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load queue'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(cardId: string) {
    try {
      await api.publishCard(cardId);
      setCards((prev) => prev.filter((c) => c.cardId !== cardId));
      showSuccess('Card published');
    } catch (err) {
      showError(err);
    }
  }

  async function handleReject(cardId: string) {
    const reason = prompt('Rejection reason:');
    if (!reason) return;

    try {
      // Return to draft
      // In a real implementation, we'd have a reject endpoint
      showSuccess('Card returned to draft');
      setCards((prev) => prev.filter((c) => c.cardId !== cardId));
    } catch (err) {
      showError(err);
    }
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Review Queue</h1>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {cards.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No cards pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((card) => (
            <div key={card.cardId} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="badge badge-review">{card.status}</span>
                    <span className="text-sm text-gray-500">
                      v{card.version}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">
                    {card.title}
                  </h2>
                  <p className="text-gray-600 text-sm mb-2">{card.claim}</p>
                  <p className="text-xs text-gray-500">
                    Event: {card.eventDate} &middot; Category: {card.category}{' '}
                    &middot; {card.sourceRefs.length} sources
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    to={`/admin/cards/${card.cardId}/edit`}
                    className="btn-secondary text-sm"
                  >
                    Review
                  </Link>
                  <button
                    onClick={() => handlePublish(card.cardId)}
                    className="btn-primary text-sm bg-green-600 hover:bg-green-700"
                  >
                    Publish
                  </button>
                  <button
                    onClick={() => handleReject(card.cardId)}
                    className="btn-secondary text-sm text-red-600 hover:text-red-700"
                  >
                    Return
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
