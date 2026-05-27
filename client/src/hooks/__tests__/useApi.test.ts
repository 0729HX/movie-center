import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApi, useDebounce } from '../useApi'

// ======================== useApi ========================

describe('useApi', () => {
  // ---------- 初始状态 ----------
  describe('初始状态', () => {
    it('应以 loading=true、data=null、error=null 开始', () => {
      const fetcher = vi.fn(() => new Promise(() => {})) // never resolves
      const { result } = renderHook(() => useApi(fetcher, []))

      expect(result.current.loading).toBe(true)
      expect(result.current.data).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  // ---------- 数据获取成功 ----------
  describe('数据获取成功', () => {
    it('fetcher 成功后应设置 data 并清除 loading', async () => {
      const mockData = { items: [1, 2, 3] }
      const fetcher = vi.fn().mockResolvedValue(mockData)

      const { result } = renderHook(() => useApi(fetcher, []))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
    })

    it('应将 AbortSignal 传递给 fetcher', async () => {
      const fetcher = vi.fn().mockResolvedValue('ok')

      const { result } = renderHook(() => useApi(fetcher, []))

      await waitFor(() => {
        expect(fetcher).toHaveBeenCalled()
      })

      // fetcher 接收 AbortSignal
      const signal = fetcher.mock.calls[0][0]
      expect(signal).toBeInstanceOf(AbortSignal)
    })
  })

  // ---------- 错误处理 ----------
  describe('错误处理', () => {
    it('fetcher 抛出 Error 时应设置 error 并清除 loading', async () => {
      const error = new Error('fetch failed')
      const fetcher = vi.fn().mockRejectedValue(error)

      const { result } = renderHook(() => useApi(fetcher, []))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe(error)
      expect(result.current.data).toBeNull()
    })

    it('fetcher 抛出非 Error 值时应包装为 Error', async () => {
      const fetcher = vi.fn().mockRejectedValue('string error')

      const { result } = renderHook(() => useApi(fetcher, []))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error!.message).toBe('string error')
    })

    it('AbortError 应被静默吞掉（不设置 error，loading 保持 true）', async () => {
      const abortError = new DOMException('aborted', 'AbortError')
      const fetcher = vi.fn().mockRejectedValue(abortError)

      const { result } = renderHook(() => useApi(fetcher, []))

      // flush microtasks so fetcher's promise settles
      await act(async () => {})

      // error 应保持 null，loading 保持 true（无 setState 被调用）
      expect(result.current.error).toBeNull()
      expect(result.current.loading).toBe(true)
    })

    it('RequestAbortedError 应被静默吞掉（不设置 error，loading 保持 true）', async () => {
      const err = new Error('cancelled')
      err.name = 'RequestAbortedError'
      const fetcher = vi.fn().mockRejectedValue(err)

      const { result } = renderHook(() => useApi(fetcher, []))

      await act(async () => {})

      expect(result.current.error).toBeNull()
      expect(result.current.loading).toBe(true)
    })
  })

  // ---------- 请求取消（deps 变化时） ----------
  describe('请求取消（deps 变化时）', () => {
    it('deps 变化时应取消前一个请求并重新发起', async () => {
      let callCount = 0
      const fetcher = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve('first')
        return Promise.resolve('second')
      })

      const { result, rerender } = renderHook(
        ({ dep }) => useApi(() => fetcher(), [dep]),
        { initialProps: { dep: 1 } },
      )

      await waitFor(() => {
        expect(result.current.data).toBe('first')
      })

      // 改变 deps，触发重新获取
      rerender({ dep: 2 })

      await waitFor(() => {
        expect(result.current.data).toBe('second')
      })

      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('deps 变化时应设置 loading=true 并清除 error', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second')

      const { result, rerender } = renderHook(
        ({ dep }) => useApi(() => fetcher(), [dep]),
        { initialProps: { dep: 1 } },
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 改变 deps
      act(() => {
        rerender({ dep: 2 })
      })

      // loading 应立即为 true
      expect(result.current.loading).toBe(true)
      expect(result.current.error).toBeNull()
    })
  })

  // ---------- refetch 功能 ----------
  describe('refetch', () => {
    it('refetch 应重新执行 fetcher', async () => {
      let counter = 0
      const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++counter))

      const { result } = renderHook(() => useApi(fetcher, []))

      await waitFor(() => {
        expect(result.current.data).toBe(1)
      })

      // 调用 refetch
      act(() => {
        result.current.refetch()
      })

      await waitFor(() => {
        expect(result.current.data).toBe(2)
      })
    })

    it('refetch 应设置 loading=true 并清除 error', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('ok')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('recovered')

      const { result } = renderHook(() => useApi(fetcher, []))

      await waitFor(() => {
        expect(result.current.data).toBe('ok')
      })

      // refetch 导致失败
      act(() => {
        result.current.refetch()
      })

      await waitFor(() => {
        expect(result.current.error).not.toBeNull()
      })

      // 再次 refetch 恢复
      act(() => {
        result.current.refetch()
      })

      await waitFor(() => {
        expect(result.current.data).toBe('recovered')
        expect(result.current.error).toBeNull()
      })
    })
  })
})

// ======================== useDebounce ========================

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始值应立即返回', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('在 delay 时间内不应更新', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } },
    )

    rerender({ value: 'updated' })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('initial')
  })

  it('在 delay 时间后应更新为新值', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } },
    )

    rerender({ value: 'updated' })

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('updated')
  })

  it('快速连续变化应只取最后一个值', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'b' })
    act(() => { vi.advanceTimersByTime(100) })

    rerender({ value: 'c' })
    act(() => { vi.advanceTimersByTime(100) })

    rerender({ value: 'd' })
    act(() => { vi.advanceTimersByTime(300) })

    expect(result.current).toBe('d')
  })
})
