import { Router } from 'express';
import { startWatcher, stopWatcher, getWatcherStatus, scrapeSingle, scrapeDirectory } from '../services/watcher';

const router = Router();

// 获取监控状态
router.get('/status', async (_req, res) => {
  const status = await getWatcherStatus();
  res.json(status);
});

// 启动监控（可选传入目录路径覆盖数据库配置）
router.post('/start', async (req, res) => {
  const watchDir = req.body.watch_dir as string | undefined;
  const result = await startWatcher(watchDir);
  res.json(result);
});

// 停止监控
router.post('/stop', (_req, res) => {
  const result = stopWatcher();
  res.json(result);
});

// 手动刮削单个文件
router.post('/scrape', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: '请提供文件路径' });
  const result = await scrapeSingle(filePath);
  res.json(result);
});

// 批量刮削目录
router.post('/scrape-dir', async (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ error: '请提供目录路径' });
  const result = await scrapeDirectory(dirPath);
  res.json(result);
});

export default router;
