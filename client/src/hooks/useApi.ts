/**
 * Reusable data-fetching and utility hooks.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── useApi — generic data-fetching hook ────────────────────────────

export interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

export interface UseApiReturn<T> extends UseApiState<T> {
  /** Re-execute the fetcher with the same args */
  refetch: () => void
}

/**
 * Generic hook for one-shot or re-fetchable data loading.
 *
 * @param fetcher  async function that returns the data (receives AbortSignal)
 * @param deps     dependency array — when any dep changes the fetcher re-runs
 *
 * @example
 *   const { data, loading, error } = useApi(
 *     (signal) => api.trending.get(signal),
 *     []
 *   )
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  // Stable ref to the latest fetcher so we can call it from refetch
  // without adding it to the effect dependency array.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refetch = useCallback(() => {
    const controller = new AbortController()
    setState(prev => ({ ...prev, loading: true, error: null }))

    fetcherRef.current(controller.signal)
      .then(data => setState({ data, loading: false, error: null }))
      .catch((err: unknown) => {
        // Swallow aborted requests — they're expected when deps change fast
        if (err instanceof DOMException && err.name === 'AbortError') return
        if ((err as Error).name === 'RequestAbortedError') return
        setState({ data: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) })
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(refetch, [refetch])

  return { ...state, refetch }
}

// ─── useDebounce — debounce a value ─────────────────────────────────

/**
 * Returns a debounced version of `value` that only updates after
 * `delay` ms of inactivity.  Useful for search inputs.
 *
 * @example
 *   const [query, setQuery] = useState('')
 *   const debounced = useDebounce(query, 300)
 *   useEffect(() => { api.search(debounced) }, [debounced])
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
