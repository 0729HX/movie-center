import { vi } from 'vitest'

// Mock ioredis —— 拦截 Redis 实例的所有方法
vi.mock('ioredis', () => {
  const store = new Map<string, string>()
  const ttls = new Map<string, string>()

  const mockRedis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      store.set(key, value)
      // 处理 'EX', ttl 模式
      if (args[0] === 'EX' && typeof args[1] === 'number') {
        ttls.set(key, String(args[1]))
      }
      return 'OK'
    }),
    incr: vi.fn(async (key: string) => {
      const current = parseInt(store.get(key) ?? '0', 10) + 1
      store.set(key, String(current))
      return current
    }),
    expire: vi.fn(async (_key: string, _ttl: number) => 1),
    del: vi.fn(async (keys: string[]) => {
      keys.forEach((k) => store.delete(k))
      return keys.length
    }),
    scan: vi.fn(async (cursor: string, ...args: unknown[]) => {
      // 从 args 中提取 MATCH pattern: ['MATCH', pattern, 'COUNT', n]
      const matchIdx = args.indexOf('MATCH')
      const pattern = matchIdx !== -1 ? (args[matchIdx + 1] as string) : '*'
      // 简单 glob 匹配：将 * 转为正则
      const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      const allKeys = [...store.keys()].filter((k) => regex.test(k))

      if (cursor === '0') {
        return ['0', allKeys]
      }
      return ['0', []]
    }),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(() => {}),
  }

  // 使用 class 模式，确保 new Redis() 正常工作
  class MockRedis {
    constructor() {
      return mockRedis
    }
  }

  return {
    default: MockRedis,
    __mockRedis: mockRedis,
    __store: store,
  }
})
