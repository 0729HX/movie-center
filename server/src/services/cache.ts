import Redis from 'ioredis';

const redis = new Redis({
  host: '127.0.0.1',
  port: 6379,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null;  // 重试 3 次后放弃
    return Math.min(times * 200, 2000);
  },
});

const PREFIX = 'mc:';

redis.connect().catch(() => {
  console.warn('[Cache] Redis 未启动，缓存功能禁用');
});

// ======================== 公共 API ========================

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(PREFIX + key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch { /* 静默 */ }
}

/**
 * 原子递增计数器，返回递增后的值
 */
export async function cacheIncr(key: string): Promise<number> {
  try {
    return await redis.incr(PREFIX + key);
  } catch {
    return 0;
  }
}

/**
 * 设置 key 的过期时间（秒）
 */
export async function cacheExpire(key: string, ttlSeconds: number): Promise<void> {
  try {
    await redis.expire(PREFIX + key, ttlSeconds);
  } catch { /* 静默 */ }
}

/**
 * 读取计数器值，不存在返回 0
 */
export async function cacheCount(key: string): Promise<number> {
  try {
    const raw = await redis.get(PREFIX + key);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * 按前缀模式删除缓存，例如 cacheDel('movies:*') 删除所有电影列表缓存
 */
export async function cacheDel(pattern: string): Promise<void> {
  try {
    const fullPattern = PREFIX + pattern;
    // 使用 SCAN 替代 KEYS，避免大 key 量时阻塞
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await redis.del(keys);
      console.log(`[Cache] 清除 ${keys.length} 个缓存 (pattern: ${pattern})`);
    }
  } catch { /* 静默 */ }
}
