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

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.iso', '.flv', '.webm', '.rmvb', '.mts', '.m2ts', '.vob', '.rm', '.3gp', '.divx', '.xvid', '.ogm', '.ogv', '.asf'];
const POSTER_NAMES = ['poster.jpg', 'poster.png', 'folder.jpg', 'cover.jpg', 'movie.jpg'];
const BACKDROP_NAMES = ['backdrop.jpg', 'fanart.jpg', 'background.jpg', 'backdrop.png'];
const CLEARLOGO_NAMES = ['clearlogo.png', 'clearlogo.jpg'];

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

interface NfoData {
  tmdbId: number | null;
  imdbId: string | null;
  ratings: { source: string; displayName: string; score: number; maxScore: number; icon: string }[];
  streamInfo: { video?: { codec?: string; width?: number; height?: number; resolution?: string }; audio?: { codec?: string; channels?: number; language?: string }; subtitles?: string[] };
  plot: string | null;
  genres: string[];
  runtime: number | null;
  tagline: string | null;
  actors: { name: string; character: string }[];
}

const RATING_MAP: Record<string, { displayName: string; maxScore: number; icon: string }> = {
  imdb:                { displayName: 'IMDb',       maxScore: 10,  icon: 'imdb' },
  themoviedb:          { displayName: 'TMDB',       maxScore: 10,  icon: 'tmdb' },
  tomatometerallcritics:{ displayName: 'RT',        maxScore: 100, icon: 'rt' },
  tomatometerrotten:   { displayName: 'RT',         maxScore: 100, icon: 'rt' },
  metacritic:          { displayName: 'Metacritic', maxScore: 100, icon: 'metacritic' },
  rogerebert:          { displayName: 'Roger Ebert',maxScore: 4,   icon: 'rogerebert' },
  letterboxd:          { displayName: 'Letterboxd', maxScore: 5,   icon: 'letterboxd' },
  trakt:               { displayName: 'Trakt',      maxScore: 10,  icon: 'trakt' },
};

/**
 * 解析 NFO 文件，提取 TMDB ID、多源评分、流媒体信息
 */
async function parseNfoFile(
  dirPath: string,
  files: Dirent[],
  fs: typeof import('fs/promises'),
): Promise<NfoData> {
  const result: NfoData = { tmdbId: null, imdbId: null, ratings: [], streamInfo: {}, plot: null, genres: [], runtime: null, tagline: null, actors: [] };

  // 查找 NFO 文件：movie.nfo / tvshow.nfo 优先，否则取第一个 .nfo
  let nfoPath: string | null = null;
  for (const name of ['movie.nfo', 'tvshow.nfo']) {
    if (files.some(f => f.name === name)) { nfoPath = path.join(dirPath, name); break; }
  }
  if (!nfoPath) {
    const nfo = files.find(f => f.name.endsWith('.nfo'));
    if (nfo) nfoPath = path.join(dirPath, nfo.name);
  }
  if (!nfoPath) return result;

  let content: string;
  try {
    content = await fs.readFile(nfoPath, 'utf-8');
  } catch {
    return result;
  }

  // TMDB ID
  let m = content.match(/<tmdbid>(\d+)<\/tmdbid>/i);
  if (!m) m = content.match(/<uniqueid\s+type=["']tmdb["'][^>]*>(\d+)<\/uniqueid>/i);
  if (m) result.tmdbId = parseInt(m[1]);

  // IMDb ID
  const imdbMatch = content.match(/<uniqueid\s+type=["']imdb["'][^>]*>(tt\d+)<\/uniqueid>/i);
  if (imdbMatch) result.imdbId = imdbMatch[1];

  // 剧情简介
  const plotMatch = content.match(/<plot>([\s\S]*?)<\/plot>/i);
  if (plotMatch) result.plot = plotMatch[1].trim();
  if (!result.plot) {
    const outlineMatch = content.match(/<outline>([\s\S]*?)<\/outline>/i);
    if (outlineMatch) result.plot = outlineMatch[1].trim();
  }

  // 分类
  const genreRe = /<genre>([^<]+)<\/genre>/gi;
  let gm: RegExpExecArray | null;
  while ((gm = genreRe.exec(content)) !== null) {
    result.genres.push(gm[1].trim());
  }

  // 时长
  const runtimeMatch = content.match(/<runtime>(\d+)<\/runtime>/i);
  if (runtimeMatch) result.runtime = parseInt(runtimeMatch[1]);

  // 标语
  const taglineMatch = content.match(/<tagline>([\s\S]*?)<\/tagline>/i);
  if (taglineMatch) result.tagline = taglineMatch[1].trim();

  // 演员
  const actorRe = /<actor>([\s\S]*?)<\/actor>/gi;
  let am: RegExpExecArray | null;
  while ((am = actorRe.exec(content)) !== null) {
    const nameMatch = am[1].match(/<name>([^<]+)<\/name>/i);
    const charMatch = am[1].match(/<character>([^<]+)<\/character>/i);
    if (nameMatch) {
      result.actors.push({ name: nameMatch[1].trim(), character: charMatch?.[1]?.trim() || '' });
    }
  }

  // 多源评分
  const ratingsBlock = content.match(/<ratings>([\s\S]*?)<\/ratings>/i);
  if (ratingsBlock) {
    const ratingRe = /<rating\s+name=["']([^"']+)["'][^>]*>[\s\S]*?<\/rating>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = ratingRe.exec(ratingsBlock[1])) !== null) {
      const source = rm[1].toLowerCase();
      const meta = RATING_MAP[source];
      if (!meta) continue;
      const valMatch = rm[0].match(/<value>([0-9.]+)<\/value>/);
      if (valMatch) {
        result.ratings.push({ source, ...meta, score: parseFloat(valMatch[1]) });
      }
    }
  }

  // 流媒体信息
  const fiMatch = content.match(/<fileinfo>([\s\S]*?)<\/fileinfo>/i);
  if (fiMatch) {
    const fi = fiMatch[1];
    const vm = fi.match(/<video>([\s\S]*?)<\/video>/i);
    if (vm) {
      const v = vm[1];
      const video: NfoData['streamInfo']['video'] = {};
      let cm = v.match(/<codec>([^<]+)<\/codec>/i);
      if (cm) video.codec = cm[1].trim();
      const wm = v.match(/<width>(\d+)<\/width>/i);
      const hm = v.match(/<height>(\d+)<\/height>/i);
      if (wm) video.width = parseInt(wm[1]);
      if (hm) video.height = parseInt(hm[1]);
      if (wm && hm) video.resolution = `${wm[1]}x${hm[1]}`;
      if (Object.keys(video).length > 0) result.streamInfo.video = video;
    }
    const am = fi.match(/<audio>([\s\S]*?)<\/audio>/i);
    if (am) {
      const a = am[1];
      const audio: NfoData['streamInfo']['audio'] = {};
      let cm = a.match(/<codec>([^<]+)<\/codec>/i);
      if (cm) audio.codec = cm[1].trim();
      const chm = a.match(/<channels>(\d+)<\/channels>/i);
      if (chm) audio.channels = parseInt(chm[1]);
      const lm = a.match(/<language>([^<]+)<\/language>/i);
      if (lm) audio.language = lm[1].trim();
      if (Object.keys(audio).length > 0) result.streamInfo.audio = audio;
    }
    const subs: string[] = [];
    const subRe = /<subtitle>([\s\S]*?)<\/subtitle>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = subRe.exec(fi)) !== null) {
      const lm = sm[1].match(/<language>([^<]+)<\/language>/i);
      if (lm) subs.push(lm[1].trim());
    }
    if (subs.length > 0) result.streamInfo.subtitles = subs;
  }

  return result;
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
    'SELECT id, tmdb_id, poster_path, backdrop_path, clearlogo_path, file_size, nfo_ratings, stream_info, imdb_id, nfo_plot, nfo_genres, nfo_runtime, nfo_tagline, nfo_actors FROM local_media WHERE local_path = ?',
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

  // === NFO 解析（TMDB ID + 多源评分 + 流媒体信息）===
  const nfoData = await parseNfoFile(dirPath, files, fs);
  const tmdbId = nfoData.tmdbId;

  // === 查找 clearlogo ===
  let clearlogoPath = '';
  for (const name of CLEARLOGO_NAMES) {
    const found = files.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (found) { clearlogoPath = path.join(dirPath, found.name); break; }
  }

  // 序列化 JSON 字段
  const nfoRatingsJson = nfoData.ratings.length > 0 ? JSON.stringify(nfoData.ratings) : null;
  const streamInfoJson = Object.keys(nfoData.streamInfo).length > 0 ? JSON.stringify(nfoData.streamInfo) : null;
  const genresJson = nfoData.genres.length > 0 ? JSON.stringify(nfoData.genres) : null;
  const actorsJson = nfoData.actors.length > 0 ? JSON.stringify(nfoData.actors) : null;

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
      row.clearlogo_path === clearlogoPath &&
      row.file_size === stat.size &&
      row.nfo_ratings === nfoRatingsJson &&
      row.stream_info === streamInfoJson &&
      row.imdb_id === nfoData.imdbId &&
      row.nfo_plot === nfoData.plot &&
      row.nfo_genres === genresJson &&
      row.nfo_runtime === nfoData.runtime &&
      row.nfo_tagline === nfoData.tagline &&
      row.nfo_actors === actorsJson;

    if (sameData) {
      return { status: 'skipped', tmdbId, mediaType };
    }

    // 数据有变化 → 更新
    await query(
      `UPDATE local_media SET tmdb_id=?, media_type=?, title=?, year=?, poster_path=?, backdrop_path=?, clearlogo_path=?, file_size=?, nfo_ratings=?, stream_info=?,
       imdb_id=?, nfo_plot=?, nfo_genres=?, nfo_runtime=?, nfo_tagline=?, nfo_actors=?, updated_at=NOW()
       WHERE id=?`,
      [tmdbId, mediaType, title, year || null, posterPath || null, backdropPath || null, clearlogoPath || null, stat.size, nfoRatingsJson, streamInfoJson,
       nfoData.imdbId, nfoData.plot, genresJson, nfoData.runtime, nfoData.tagline, actorsJson, row.id],
    );
    return { status: 'updated', tmdbId, mediaType };
  }

  // === 新记录 → 插入 ===
  await query(
    `INSERT INTO local_media (tmdb_id, media_type, title, year, local_path, poster_path, backdrop_path, clearlogo_path, file_size, nfo_ratings, stream_info,
     imdb_id, nfo_plot, nfo_genres, nfo_runtime, nfo_tagline, nfo_actors)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tmdbId, mediaType, title, year || null, videoPath, posterPath || null, backdropPath || null, clearlogoPath || null, stat.size, nfoRatingsJson, streamInfoJson,
     nfoData.imdbId, nfoData.plot, genresJson, nfoData.runtime, nfoData.tagline, actorsJson],
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

/**
 * 关联下载完成的文件到现有记录
 * 下载完成后扫描目录时调用，将下载的文件路径回写到 local_media
 */
export async function linkDownload(
  localId: number,
  filePath: string,
  fileSize: number,
): Promise<boolean> {
  try {
    const result: any = await query(
      `UPDATE local_media SET local_path = ?, file_size = ?, updated_at = NOW() WHERE id = ? AND (local_path IS NULL OR local_path = '')`,
      [filePath, fileSize, localId],
    );
    if (result.affectedRows > 0) {
      console.log(`[Scanner] 已关联下载文件: localId=${localId}, path=${filePath}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[Scanner] 关联下载文件失败: localId=${localId}`, err);
    return false;
  }
}
