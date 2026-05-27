/**
 * ProgressTracker — In-memory progress store for long-running operations
 *
 * Pattern matches existing GET /api/watcher/status polling approach.
 * All new long-running operations (scraping, file organization, track removal)
 * report progress here. Clients poll for status.
 *
 * Auto-cleanup after 30 minutes to prevent memory leaks.
 */

// ======================== Types ========================

export type OperationStatus = 'running' | 'completed' | 'failed';

export interface OperationProgress {
  id: string;
  status: OperationStatus;
  total: number;
  current: number;
  description: string;
  message?: string;
  result?: unknown;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

// ======================== Store ========================

const operations = new Map<string, OperationProgress>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // Check every 5 minutes
const MAX_AGE_MS = 30 * 60 * 1000;          // Auto-cleanup after 30 minutes

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupRunning(): void {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, op] of operations.entries()) {
      const age = now - op.startedAt;
      if (age > MAX_AGE_MS) {
        operations.delete(id);
      }
    }
    if (operations.size === 0 && cleanupTimer !== null) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);

  // Unref so the timer does not keep the process alive
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ======================== Public API ========================

/**
 * Register a new operation. Returns the operation ID for subsequent calls.
 */
export function startOperation(id: string, total: number, description: string): void {
  ensureCleanupRunning();
  operations.set(id, {
    id,
    status: 'running',
    total,
    current: 0,
    description,
    startedAt: Date.now(),
  });
}

/**
 * Update progress for an in-flight operation.
 */
export function updateProgress(id: string, current: number, message?: string): void {
  const op = operations.get(id);
  if (!op || op.status !== 'running') return;
  op.current = current;
  if (message !== undefined) op.message = message;
}

/**
 * Mark an operation as completed.
 */
export function completeOperation(id: string, result?: unknown): void {
  const op = operations.get(id);
  if (!op) return;
  op.status = 'completed';
  op.current = op.total;
  op.completedAt = Date.now();
  if (result !== undefined) op.result = result;
}

/**
 * Mark an operation as failed.
 */
export function failOperation(id: string, error: string): void {
  const op = operations.get(id);
  if (!op) return;
  op.status = 'failed';
  op.error = error;
  op.completedAt = Date.now();
}

/**
 * Get current progress for an operation. Returns undefined if not found.
 */
export function getProgress(id: string): OperationProgress | undefined {
  return operations.get(id);
}

/**
 * Generate a unique operation ID.
 */
export function generateOperationId(prefix: string = 'op'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
