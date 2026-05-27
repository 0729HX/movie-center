import { describe, it, expect, beforeEach, vi } from 'vitest'

// cache.ts 在模块加载时会调用 redis.connect()，
// setup.ts 已全局 mock 了 ioredis，此处直接导入即可。
import { cacheGet, cacheSet, cacheIncr, cacheExpire, cacheCount, cacheDel } from '../cache'

// 获取 mock 的 Redis 实例和内存 store
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ioredisMock = await import('ioredis') as any
const store: Map<string, string> = ioredisMock.__store

// ======================== 辅助函数 ========================

function resetStore() {
  store.clear()
}

// ======================== 测试用例 ========================

describe('cache service', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  // ---------- cacheSet ----------
  describe('cacheSet', () => {
    it('应将数据序列化后写入 Redis，key 带 mc: 前缀', async () => {
      await cacheSet('movies:list', { page: 1, results: [] }, 60)

      expect(store.has('mc:movies:list')).toBe(true)
      const stored = JSON.parse(store.get('mc:movies:list')!)
      expect(stored).toEqual({ page: 1, results: [] })
    })

    it('应支持写入字符串值', async () => {
      await cacheSet('simple', 'hello', 30)
      expect(store.get('mc:simple')).toBe('"hello"')
    })

    it('应支持写入数组', async () => {
      await cacheSet('ids', [1, 2, 3], 10)
      expect(JSON.parse(store.get('mc:ids')!)).toEqual([1, 2, 3])
    })

    it('应支持写入 null（序列化为 "null"）', async () => {
      await cacheSet('empty', null, 5)
      expect(store.get('mc:empty')).toBe('null')
    })
  })

  // ---------- cacheGet ----------
  describe('cacheGet', () => {
    it('命中缓存时应返回反序列化后的数据', async () => {
      const data = { id: 1, title: 'Inception' }
      store.set('mc:detail:1', JSON.stringify(data))

      const result = await cacheGet<typeof data>('detail:1')
      expect(result).toEqual(data)
    })

    it('未命中缓存时应返回 null', async () => {
      const result = await cacheGet('nonexistent')
      expect(result).toBeNull()
    })

    it('应正确解析字符串值', async () => {
      store.set('mc:greeting', '"hello world"')
      const result = await cacheGet<string>('greeting')
      expect(result).toBe('hello world')
    })

    it('应正确解析数字值', async () => {
      store.set('mc:count', '42')
      const result = await cacheGet<number>('count')
      expect(result).toBe(42)
    })

    it('key 前缀应为 mc:', async () => {
      store.set('mc:prefix-test', JSON.stringify({ ok: true }))
      const result = await cacheGet('prefix-test')
      expect(result).toEqual({ ok: true })
    })
  })

  // ---------- cacheIncr ----------
  describe('cacheIncr', () => {
    it('key 不存在时应初始化为 1', async () => {
      const result = await cacheIncr('counter')
      expect(result).toBe(1)
      expect(store.get('mc:counter')).toBe('1')
    })

    it('key 已存在时应原子递增', async () => {
      store.set('mc:counter', '5')
      const result = await cacheIncr('counter')
      expect(result).toBe(6)
      expect(store.get('mc:counter')).toBe('6')
    })

    it('连续递增应返回递增后的值', async () => {
      expect(await cacheIncr('seq')).toBe(1)
      expect(await cacheIncr('seq')).toBe(2)
      expect(await cacheIncr('seq')).toBe(3)
    })
  })

  // ---------- cacheExpire ----------
  describe('cacheExpire', () => {
    it('应为 key 设置过期时间（不抛异常）', async () => {
      store.set('mc:ttl-test', '"data"')
      await expect(cacheExpire('ttl-test', 300)).resolves.toBeUndefined()
    })
  })

  // ---------- cacheCount ----------
  describe('cacheCount', () => {
    it('key 不存在时应返回 0', async () => {
      const result = await cacheCount('missing')
      expect(result).toBe(0)
    })

    it('key 存在时应返回解析后的整数', async () => {
      store.set('mc:views', '42')
      const result = await cacheCount('views')
      expect(result).toBe(42)
    })

    it('值为非数字字符串时应返回 0', async () => {
      store.set('mc:not-a-number', 'abc')
      const result = await cacheCount('not-a-number')
      expect(result).toBe(0)
    })

    it('值为 JSON 对象字符串时应返回 0', async () => {
      store.set('mc:obj', '{"key":"value"}')
      const result = await cacheCount('obj')
      expect(result).toBe(0)
    })
  })

  // ---------- cacheDel ----------
  describe('cacheDel', () => {
    it('应删除匹配前缀的所有 key', async () => {
      store.set('mc:movies:1', '"a"')
      store.set('mc:movies:2', '"b"')
      store.set('mc:movies:3', '"c"')
      store.set('mc:tv:1', '"d"')

      await cacheDel('movies:*')

      expect(store.has('mc:movies:1')).toBe(false)
      expect(store.has('mc:movies:2')).toBe(false)
      expect(store.has('mc:movies:3')).toBe(false)
      expect(store.has('mc:tv:1')).toBe(true) // 不匹配的应保留
    })

    it('无匹配 key 时应静默完成', async () => {
      store.set('mc:other', '"x"')
      await expect(cacheDel('nothing:*')).resolves.toBeUndefined()
      expect(store.has('mc:other')).toBe(true)
    })

    it('应使用 SCAN 遍历而非 KEYS', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockRedis = ioredisMock.__mockRedis
      store.set('mc:scan-test:1', '"a"')

      await cacheDel('scan-test:*')

      expect(mockRedis.scan).toHaveBeenCalled()
    })
  })

  // ---------- 错误处理 ----------
  describe('错误处理', () => {
    it('cacheGet 在 Redis 抛异常时应返回 null', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockRedis = ioredisMock.__mockRedis
      mockRedis.get.mockRejectedValueOnce(new Error('Connection lost'))

      const result = await cacheGet('anything')
      expect(result).toBeNull()
    })

    it('cacheSet 在 Redis 抛异常时应静默吞掉', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockRedis = ioredisMock.__mockRedis
      mockRedis.set.mockRejectedValueOnce(new Error('Connection lost'))

      await expect(cacheSet('key', 'val', 10)).resolves.toBeUndefined()
    })

    it('cacheIncr 在 Redis 抛异常时应返回 0', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockRedis = ioredisMock.__mockRedis
      mockRedis.incr.mockRejectedValueOnce(new Error('Connection lost'))

      const result = await cacheIncr('counter')
      expect(result).toBe(0)
    })

    it('cacheCount 在 Redis 抛异常时应返回 0', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockRedis = ioredisMock.__mockRedis
      mockRedis.get.mockRejectedValueOnce(new Error('Connection lost'))

      const result = await cacheCount('counter')
      expect(result).toBe(0)
    })

    it('cacheDel 在 Redis 抛异常时应静默吞掉', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockRedis = ioredisMock.__mockRedis
      mockRedis.scan.mockRejectedValueOnce(new Error('Connection lost'))

      await expect(cacheDel('key:*')).resolves.toBeUndefined()
    })
  })
})
