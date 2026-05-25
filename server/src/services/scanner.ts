import path from 'path';
import type { Dirent } from 'fs';
import { query } from '../db';
import type { LocalMedia } from '../types';

export interface ScanResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** 有 TMDB ID 的条目，用于扫描后预热详情缓存 */
  tmdbItems: { mediaType: 'movie' | 'tv'; tmdbId: number }[];
}

interface ProcessResult {
  status: 'added' | 'updated' | 'skipped';
  tmdbId: number | null;
  mediaType: 'movie' | 'tv';
}

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.iso', '.flv', '.webm'];
const POSTER_NAMES = ['poster.jpg', 'poster.png', 'folder.jpg', 'cover.jpg', 'movie.jpg'];
const BACKDROP_NAMES = ['backdrop.jpg', 'fanart.jpg', 'background.jpg', 'backdrop.png'];

/**
 * 递归扫描目录，自动下钻查找所有影视文件
 *
 * 支持的目录结构：
 *   扁平结构:  D:/movies/Inception.mkv
 *   一级目录:  D:/movies/Inception (2010)/Inception.mkv
 *   多级嵌套:  D:/media/Movies/Sci-Fi/Inception (2010)/Inception.mkv
 *   剧集结构:  D:/tv/Breaking Bad/Season 01/S01E01.mkv
 */
export async function scanDirectory(rootPath: string): Promise<ScanResult> {
  const result: ScanResult = { added: 0, updated: 0, skipped: 0, errors: [], tmdbItems: [] };

  try {
    const fs = await import('fs/promises');
    await walkDir(rootPath, rootPath, fs, result);
  } catch (err: any) {
    result.errors.push(`扫描失败: ${err.message}`);
  }

  return result;
}

/**
 * 递归遍历目录
 */
async function walkDir(
  dirPath: string,
  rootPath: string,
  fs: typeof import('fs/promises'),
  result: ScanResult,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  const files = entries.filter(e => e.isFile());
  const dirs = entries.filter(e => e.isDirectory());

  const hasVideo = files.some(f => VIDEO_EXTS.includes(path.extname(f.name).toLowerCase()));
  const seasonDirs = dirs.filter(d => d.name.toLowerCase().startsWith('season'));

  if (hasVideo || seasonDirs.length > 0) {
    try {
      const pr = await processMediaDir(dirPath, fs);
      if (pr.status === 'added') result.added++;
      else if (pr.status === 'updated') result.updated++;
      else result.skipped++;
      if (pr.tmdbId) {
        result.tmdbItems.push({ mediaType: pr.mediaType, tmdbId: pr.tmdbId });
      }
    } catch (err: any) {
      const relPath = path.relative(rootPath, dirPath) || path.basename(dirPath);
      result.errors.push(`${relPath}: ${err.message}`);
    }
    return;
  }

  for (const dir of dirs) {
    const skipNames = ['$recycle.bin', 'system volume information', 'lost+found', '.trash', '@eadir'];
    if (skipNames.includes(dir.name.toLowerCase())) continue;
    await walkDir(path.join(dirPath, dir.name), rootPath, fs, result);
  }
}

/**
 * 处理单个媒体目录：提取视频、海报、背景、NFO，按文件路径去重写入数据库
 */
async function processMediaDir(
  dirPath: string,
  fs: typeof import('fs/promises'),
): Promise<ProcessResult> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries.filter(e => e.isFile());
  const dirs = entries.filter(e => e.isDirectory());
  const dirName = path.basename(dirPath);

  // === 查找视频文件 ===
  let videoPath = '';
  for (const file of files) {
    if (VIDEO_EXTS.includes(path.extname(file.name).toLowerCase())) {
      videoPath = path.join(dirPath, file.name);
      break;
    }
  }
  if (!videoPath) {
    const seasonDirs = dirs.filter(d => d.name.toLowerCase().startsWith('season'));
    for (const sd of seasonDirs) {
      try {
        const sf = await fs.readdir(path.join(dirPath, sd.name), { withFileTypes: true });
        for (const s of sf) {
          if (s.isFile() && VIDEO_EXTS.includes(path.extname(s.name).toLowerCase())) {
            videoPath = path.join(dirPath, sd.name, s.name);
            break;
          }
        }
      } catch { /* skip */ }
      if (videoPath) break;
    }
  }
  if (!videoPath) throw new Error('未找到视频文件');

  // === 去重：按 local_path 检查是否已存在 ===
  const existing: any[] = await query(
    'SELECT id, tmdb_id, poster_path, backdrop_path, file_size FROM local_media WHERE local_path = ?',
    [videoPath],
  );

  // === 查找海报 ===
  let posterPath = '';
  for (const name of POSTER_NAMES) {
    const found = files.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (found) { posterPath = path.join(dirPath, found.name); break; }
  }
  if (!posterPath) {
    const seasonDirs = dirs.filter(d => d.name.toLowerCase().startsWith('season'));
    for (const sd of seasonDirs) {
      try {
        const sf = await fs.readdir(path.join(dirPath, sd.name), { withFileTypes: true });
        for (const name of POSTER_NAMES) {
          const found = sf.find(f => f.isFile() && f.name.toLowerCase() === name.toLowerCase());
          if (found) { posterPath = path.join(dirPath, sd.name, found.name); break; }
        }
      } catch { /* skip */ }
      if (posterPath) break;
    }
  }

  // === 查找背景图 ===
  let backdropPath = '';
  for (const name of BACKDROP_NAMES) {
    const found = files.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (found) { backdropPath = path.join(dirPath, found.name); break; }
  }

  // === NFO 解析 TMDB ID ===
  let tmdbId: number | null = null;
  for (const file of files) {
    if (file.name === 'movie.nfo' || file.name === 'tvshow.nfo') {
      try {
        const nfoContent = await fs.readFile(path.join(dirPath, file.name), 'utf-8');
        // 兼容多种 NFO 格式：
        //   1. TMM v4: <tmdbid>12345</tmdbid>
        //   2. Kodi/Emby: <uniqueid type="tmdb" default="true">12345</uniqueid>
        let match = nfoContent.match(/<tmdbid>(\d+)<\/tmdbid>/i);
        if (!match) {
          match = nfoContent.match(/<uniqueid\s+type=["']tmdb["'][^>]*>(\d+)<\/uniqueid>/i);
        }
        if (match) tmdbId = parseInt(match[1]);
      } catch { /* skip */ }
      break;
    }
  }

  // === 从目录名提取标题和年份 ===
  const titleMatch = dirName.match(/^(.+?)\s*\(?(\d{4})\)?\s*$/);
  const title = titleMatch ? titleMatch[1].trim() : dirName;
  const year = titleMatch ? parseInt(titleMatch[2]) : undefined;

  // === 判断媒体类型 ===
  const hasTvNfo = files.some(f => f.name === 'tvshow.nfo');
  const hasSeasonDir = dirs.some(d => d.name.toLowerCase().startsWith('season'));
  const isTvEpisode = /[Ss]\d{2}[Ee]\d{2}/.test(path.basename(videoPath));
  const mediaType: 'movie' | 'tv' = (hasTvNfo || hasSeasonDir || isTvEpisode) ? 'tv' : 'movie';

  // === 文件大小 ===
  const stat = await fs.stat(videoPath);

  // === 去重判断 ===
  if (existing.length > 0) {
    const row = existing[0];
    const sameData =
      row.tmdb_id === tmdbId &&
      row.poster_path === posterPath &&
      row.backdrop_path === backdropPath &&
      row.file_size === stat.size;

    if (sameData) {
      return { status: 'skipped', tmdbId, mediaType };
    }

    // 数据有变化 → 更新
    await query(
      `UPDATE local_media SET tmdb_id=?, media_type=?, title=?, year=?, poster_path=?, backdrop_path=?, file_size=?, updated_at=NOW()
       WHERE id=?`,
      [tmdbId, mediaType, title, year || null, posterPath || null, backdropPath || null, stat.size, row.id],
    );
    return { status: 'updated', tmdbId, mediaType };
  }

  // === 新记录 → 插入 ===
  await query(
    `INSERT INTO local_media (tmdb_id, media_type, title, year, local_path, poster_path, backdrop_path, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [tmdbId, mediaType, title, year || null, videoPath, posterPath || null, backdropPath || null, stat.size],
  );
  return { status: 'added', tmdbId, mediaType };
}

// === 获取本地媒体列表 ===
export async function getLocalMediaList(): Promise<LocalMedia[]> {
  return await query<LocalMedia[]>('SELECT * FROM local_media ORDER BY added_at DESC');
}

// === 从 TMDB 添加到本地（标记收藏） ===
export async function addToLocal(tmdbId: number, mediaType: 'movie' | 'tv', title: string): Promise<number> {
  const result: any = await query(
    `INSERT IGNORE INTO local_media (tmdb_id, media_type, title) VALUES (?, ?, ?)`,
    [tmdbId, mediaType, title]
  );
  return result.insertId || 0;
}

// === 从本地删除 ===
export async function removeFromLocal(id: number): Promise<boolean> {
  const result: any = await query('DELETE FROM local_media WHERE id = ?', [id]);
  return result.affectedRows > 0;
}
