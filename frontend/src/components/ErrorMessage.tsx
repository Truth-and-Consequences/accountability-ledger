import { ApiRequestError } from '../lib/api';

interface ErrorMessageProps {
  error: Error | string | null;
  onDismiss?: () => void;
}

/**
 * Displays an error message with request ID for support reference.
 * If the error is an ApiRequestError, shows the request ID.
 */
export default function ErrorMessage({ error, onDismiss }: ErrorMessageProps) {
  if (!error) return null;

  const message = typeof error === 'string' ? error : error.message;
  const requestId = error instanceof ApiRequestError ? error.requestId : null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm text-red-800">{message}</p>
          {requestId && (
            <p className="mt-1 text-xs text-red-600">
              Reference: <code className="font-mono">{requestId}</code>
            </p>
          )}
        </div>
        {onDismiss && (
          <div className="ml-4">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex text-red-400 hover:text-red-600"
            >
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Formats an error for display, extracting request ID if available.
 * Use this when you need to show errors in alerts or toast notifications.
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return `${error.message}\n\nReference: ${error.requestId}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
