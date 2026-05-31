import { Router } from 'express';
import { query } from '../db';
import {
  enqueue,
  enqueueBatch,
  cancel,
  retry,
  getQueueStatus,
  getDownloadStatus,
  getDownloadLog,
  testQuarkConnection,
  aria2HealthCheck,
} from '../services/download';
import { readQuarkCookie } from '../services/download/browser-cookie';
import { badRequest, notFound, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';

const router = Router();

// ======================== 下载队列管理 ========================

// 加入下载队列
router.post('/queue', async (
  req: TypedRequest<Record<string, string>, { local_id: number }>,
  res: TypedResponse<{ success: boolean; status: string; message: string }>,
) => {
  try {
    const { local_id } = req.body;
    if (!local_id) throw badRequest('缺少 local_id');

    // 查询影视信息
    const rows: any[] = await query(
      'SELECT id, title, year, media_type, tmdb_id FROM local_media WHERE id = ?',
      [local_id],
    );
    if (rows.length === 0) throw notFound('未找到该本地媒体');

    const item = rows[0];
    const result = await enqueue(item.id, item.title, item.year, item.media_type, item.tmdb_id);

    res.json({
      success: result.queued,
      status: result.queued ? 'pending' : 'skipped',
      message: result.message,
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw internalError('加入下载队列失败');
  }
});

// 批量加入下载队列
router.post('/queue/batch', async (
  req: TypedRequest<Record<string, string>, { local_ids: number[] }>,
  res: TypedResponse<{ queued: number; skipped: number; messages: string[] }>,
) => {
  try {
    const { local_ids } = req.body;
    if (!local_ids || !Array.isArray(local_ids) || local_ids.length === 0) {
      throw badRequest('缺少 local_ids 数组');
    }

    // 批量查询影视信息
    const placeholders = local_ids.map(() => '?').join(',');
    const rows: any[] = await query(
      `SELECT id, title, year, media_type, tmdb_id FROM local_media WHERE id IN (${placeholders})`,
      local_ids,
    );

    const items = rows.map((r: any) => ({
      localId: r.id,
      title: r.title,
      year: r.year,
      mediaType: r.media_type as 'movie' | 'tv',
      tmdbId: r.tmdb_id,
    }));

    const result = await enqueueBatch(items);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw internalError('批量加入队列失败');
  }
});

// 获取下载队列状态
router.get('/queue', async (_req, res: TypedResponse<ReturnType<typeof getQueueStatus>>) => {
  try {
    res.json(getQueueStatus());
  } catch (err: unknown) {
    throw internalError('获取队列状态失败');
  }
});

// 取消下载
router.delete('/queue/:localId', async (
  req: TypedRequest<{ localId: string }>,
  res: TypedResponse<{ success: boolean; message: string }>,
) => {
  try {
    const localId = parseInt(req.params.localId);
    if (isNaN(localId)) throw badRequest('无效的 localId');

    const result = await cancel(localId);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw internalError('取消下载失败');
  }
});

// 重试失败下载
router.post('/retry/:localId', async (
  req: TypedRequest<{ localId: string }>,
  res: TypedResponse<{ queued: boolean; message: string }>,
) => {
  try {
    const localId = parseInt(req.params.localId);
    if (isNaN(localId)) throw badRequest('无效的 localId');

    const result = await retry(localId);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw internalError('重试下载失败');
  }
});

// ======================== 状态查询 ========================

// 查询单个影视的下载状态
router.get('/status/:localId', async (
  req: TypedRequest<{ localId: string }>,
  res: TypedResponse<Record<string, unknown>>,
) => {
  try {
    const localId = parseInt(req.params.localId);
    if (isNaN(localId)) throw badRequest('无效的 localId');

    const status = await getDownloadStatus(localId);
    if (!status) throw notFound('未找到该媒体记录');

    res.json(status);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    throw internalError('获取下载状态失败');
  }
});

// 获取下载历史日志
router.get('/log', async (
  req: TypedRequest<Record<string, string>, unknown, { limit?: string }>,
  res: TypedResponse<{ logs: any[] }>,
) => {
  try {
    const limit = parseInt(req.query.limit || '50');
    const logs = await getDownloadLog(limit);
    res.json({ logs });
  } catch (err: unknown) {
    throw internalError('获取下载日志失败');
  }
});

// ======================== 连接测试 ========================

// 测试夸克网盘连接
router.get('/test/quark', async (_req, res: TypedResponse<{ success: boolean; message: string }>) => {
  try {
    const result = await testQuarkConnection();
    res.json(result);
  } catch (err: unknown) {
    throw internalError('测试夸克连接失败');
  }
});

// 测试 Aria2 连接
router.get('/test/aria2', async (_req, res: TypedResponse<{ available: boolean; version?: string; error?: string }>) => {
  try {
    const result = await aria2HealthCheck();
    res.json(result);
  } catch (err: unknown) {
    throw internalError('测试 Aria2 连接失败');
  }
});

// ======================== 浏览器 Cookie ========================

// 从本地浏览器自动读取夸克网盘 Cookie
router.get('/browser-cookie', async (_req, res: TypedResponse<{ success: boolean; browser?: string; cookie?: string; domains?: string[]; error?: string }>) => {
  try {
    const result = await readQuarkCookie();

    if (result.success && result.cookie) {
      // 自动写入配置
      await query(
        "INSERT INTO config (`key`, `value`) VALUES ('quark_cookie', ?) ON DUPLICATE KEY UPDATE `value` = ?",
        [result.cookie, result.cookie],
      );
    }

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('[BrowserCookie] 读取失败:', message);
    throw internalError(`读取浏览器 Cookie 失败: ${message}`);
  }
});

export default router;
