import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import { errorHandler, badRequest, notFound, internalError } from './middleware/errorHandler';
import trendingRouter from './routes/trending';
import moviesRouter from './routes/movies';
import tvRouter from './routes/tv';
import searchRouter from './routes/search';
import detailRouter from './routes/detail';
import localRouter from './routes/local';
import configRouter from './routes/config';
import watcherRouter from './routes/watcher';

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// API 路由
app.use('/api/trending', trendingRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/tv', tvRouter);
app.use('/api/search', searchRouter);
app.use('/api/detail', detailRouter);
app.use('/api/local', localRouter);
app.use('/api/config', configRouter);
app.use('/api/watcher', watcherRouter);

// 本地海报文件服务（处理 Windows 绝对路径如 H:\movies\...）
// 使用查询参数方式避免 URL 路径中的冒号问题
app.get('/api/local/file', (req, res, next) => {
  const filePath = req.query.path as string;
  if (!filePath) return next(badRequest('缺少 path 参数'));

  const decodedPath = decodeURIComponent(filePath);

  // 检查文件是否存在且不是目录
  let stat;
  try {
    stat = fs.statSync(decodedPath);
  } catch {
    return next(notFound('文件不存在'));
  }
  if (stat.isDirectory()) {
    return next(badRequest('路径是目录'));
  }

  const ext = path.extname(decodedPath).toLowerCase();
  const mime: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const contentType = mime[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  const stream = fs.createReadStream(decodedPath);
  stream.on('error', (err) => {
    console.error(`[FileServe] ${decodedPath}: ${err.message}`);
    if (!res.headersSent) next(internalError('文件读取失败'));
  });
  stream.pipe(res);
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 全局错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✓ Movie Center Server running at http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api`);
});
