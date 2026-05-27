import { Router } from 'express';
import { startWatcher, stopWatcher, getWatcherStatus, scrapeSingle, scrapeDirectory } from '../services/watcher';
import { badRequest, internalError } from '../middleware/errorHandler';
import type { TypedRequest, TypedResponse } from '../types/api';

const router = Router();

// 获取监控状态
router.get('/status', async (_req, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const status = await getWatcherStatus();
    res.json(status);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Watcher status error:', message);
    throw internalError('获取监控状态失败');
  }
});

// 启动监控（可选传入目录路径覆盖数据库配置）
router.post('/start', async (req: TypedRequest<Record<string, string>, { watch_dir?: string }>, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const watchDir = req.body.watch_dir as string | undefined;
    const result = await startWatcher(watchDir);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Watcher start error:', message);
    throw internalError('启动监控失败');
  }
});

// 停止监控
router.post('/stop', (_req, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const result = stopWatcher();
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Watcher stop error:', message);
    throw internalError('停止监控失败');
  }
});

// 手动刮削单个文件
router.post('/scrape', async (req: TypedRequest<Record<string, string>, { path?: string }>, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) throw badRequest('请提供文件路径');
    const result = await scrapeSingle(filePath);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Scrape error:', message);
    throw internalError('刮削失败');
  }
});

// 批量刮削目录
router.post('/scrape-dir', async (req: TypedRequest<Record<string, string>, { path?: string }>, res: TypedResponse<Record<string, unknown>>) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) throw badRequest('请提供目录路径');
    const result = await scrapeDirectory(dirPath);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) throw err;
    const message = err instanceof Error ? err.message : '未知错误';
    console.error('Scrape dir error:', message);
    throw internalError('批量刮削失败');
  }
});

export default router;
