import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { query } from '../db';

const videoExts = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.m4v', '.ts', '.iso']);
const seenFiles = new Set<string>();

// === 读取配置 ===
async function getConfig(key: string): Promise<string> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', [key]);
  return rows[0]?.value || '';
}

// === 判断是否为视频文件 ===
function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return videoExts.has(ext);
}

// === 获取目录下所有视频文件（递归，但跳过 . 开头的隐藏目录） ===
function scanForVideos(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // 跳过隐藏目录
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanForVideos(fullPath));
      } else if (isVideoFile(fullPath)) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}

// === 运行 TMM 刮削 ===
// 支持三种 TMM 版本格式:
//   TMM v5 CMD:   tinyMediaManagerCMD.exe movie -u -n -r -m "dir"
//   tmmcmd:       tmmcmd.bat --scrape --updateAll --movieDir "dir"
//   旧版主程序:   tinyMediaManager.exe --scrape --update --nfo --images "dir"
async function runTmm(filePath: string): Promise<{ success: boolean; message: string }> {
  const tmmPath = await getConfig('tmm_path');
  const tmmArgs = await getConfig('tmm_args');
  const outputDir = await getConfig('output_dir');

  if (!tmmPath) {
    return { success: false, message: '未配置 TMM 路径' };
  }

  const parentDir = path.dirname(filePath);

  // 自动检测版本并构造命令
  const isV5Cmd = /CMD\.exe$/i.test(tmmPath);
  const isTmmcmd = /tmmcmd/i.test(tmmPath);

  let cmd: string;
  if (isV5Cmd) {
    // TMM v5 CMD 格式: cmd movie -u -n -r -m "dir"
    // 从用户参数中提取额外的标志（如 -r 重命名、-s 字幕等）
    const extraFlags = tmmArgs.replace(/movie|tvshow/gi, '').trim();
    cmd = `"${tmmPath}" movie -u -n -m "${parentDir}" ${extraFlags}`;
  } else if (isTmmcmd) {
    // 旧版 tmmcmd 格式: tmmcmd --scrape --updateAll --movieDir "dir"
    const hasDirArg = tmmArgs.includes('--movieDir') || tmmArgs.includes('--tvShowDir');
    const dirFlag = hasDirArg ? '' : ` --movieDir "${parentDir}"`;
    cmd = `"${tmmPath}" ${tmmArgs}${dirFlag}`;
  } else {
    // GUI 主程序: TinyMediaManager.exe --scrape --update
    const dirFlag = ` --movieDir "${parentDir}"`;
    cmd = `"${tmmPath}" ${tmmArgs}${dirFlag}`;
  }

  return new Promise((resolve) => {
    console.log(`[TMM] 开始刮削: ${parentDir}`);
    console.log(`[TMM] 命令: ${cmd}`);

    exec(cmd, { timeout: 300000, maxBuffer: 1024 * 1024 }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`[TMM] 错误码: ${error.code}, 消息: ${error.message}`);
        console.log(`[TMM] stdout: ${(stdout || '').slice(0, 300)}`);
        if (stderr) console.log(`[TMM] stderr: ${(stderr || '').slice(0, 300)}`);
        // TMM v5 即使成功有时也返回非零退出码，检查输出判断
        if (stdout && (stdout.includes('Finished') || stdout.includes('done') || stdout.includes('DONE'))) {
          console.log(`[TMM] 输出显示已完成`);
        } else {
          resolve({ success: false, message: `刮削失败: ${error.message}` });
          return;
        }
      } else {
        console.log(`[TMM] 刮削完成: ${parentDir}`);
      }

      // 刮削完成后移动到输出目录
      if (outputDir) {
        try {
          await moveToOutput(filePath, parentDir, outputDir);
        } catch (err: any) {
          console.error(`[TMM] 移动失败: ${err.message}`);
        }
      }

      resolve({ success: true, message: '刮削完成' });
    });
  });
}

// === 移动刮削后的文件到输出目录 ===
async function moveToOutput(videoPath: string, sourceDir: string, outputDir: string): Promise<void> {
  const fsPromises = await import('fs/promises');
  const dirName = path.basename(sourceDir);
  const targetDir = path.join(outputDir, dirName);

  // 创建目标目录
  await fsPromises.mkdir(targetDir, { recursive: true });

  // 移动整个目录
  const entries = await fsPromises.readdir(sourceDir);
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry);
    const dstPath = path.join(targetDir, entry);
    await fsPromises.rename(srcPath, dstPath).catch(async () => {
      // 跨驱动器移动失败时使用 copy+delete
      await fsPromises.cp(srcPath, dstPath, { recursive: true, errorOnExist: false });
      await fsPromises.rm(srcPath, { recursive: true, force: true });
    });
  }

  console.log(`[TMM] 已移动到: ${targetDir}`);
}

// === 文件监控 ===
let watcherActive = false;
let watchInterval: ReturnType<typeof setInterval> | null = null;

export async function startWatcher(dirOverride?: string): Promise<{ success: boolean; message: string }> {
  if (watcherActive) {
    return { success: false, message: '监控器已运行' };
  }

  // 优先使用传入路径，否则从数据库读取
  let watchDir = dirOverride || await getConfig('watch_dir');
  if (!watchDir) {
    return { success: false, message: '未配置监控目录，请在设置中填写' };
  }

  // 规范化路径格式（处理正反斜杠混合）
  watchDir = path.normalize(watchDir).trim();

  console.log(`[Watcher] 检查目录: ${watchDir}`);

  if (!fs.existsSync(watchDir)) {
    console.error(`[Watcher] 目录不存在: ${watchDir}`);
    return { success: false, message: `监控目录不存在: ${watchDir}` };
  }

  watcherActive = true;
  console.log(`[Watcher] 开始监控: ${watchDir}`);

  // 初始扫描：记录已有文件
  const existingFiles = scanForVideos(watchDir);
  for (const f of existingFiles) {
    seenFiles.add(f);
  }
  console.log(`[Watcher] 已记录 ${existingFiles.length} 个现有文件`);

  // 检查 TMM 是否已配置
  const tmmCheck = await getConfig('tmm_path');
  console.log(`[Watcher] TMM 路径: ${tmmCheck || '⚠️ 未配置'}`);

  // 每 30 秒检查新文件
  let cycleCount = 0;
  watchInterval = setInterval(async () => {
    if (!watcherActive) return;

    cycleCount++;
    const startTime = Date.now();
    const allFiles = scanForVideos(watchDir);
    const newFiles = allFiles.filter(f => !seenFiles.has(f));

    if (newFiles.length > 0) {
      console.log(`[Watcher] 扫描 #${cycleCount}: 发现 ${newFiles.length} 个新文件`);
    }

    for (const file of newFiles) {
      seenFiles.add(file);
      console.log(`[Watcher] → ${path.basename(file)}`);
      const result = await runTmm(file);
      console.log(`[Watcher] → 结果: ${result.message}`);
    }

    const elapsed = Date.now() - startTime;
    if (cycleCount % 20 === 0) {
      console.log(`[Watcher] 扫描 #${cycleCount}: ${allFiles.length} 文件, ${elapsed}ms`);
    }
  }, 30000);

  return { success: true, message: `监控已启动: ${watchDir}` };
}

export function stopWatcher(): { success: boolean; message: string } {
  if (!watcherActive) {
    return { success: false, message: '监控器未运行' };
  }
  watcherActive = false;
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
  console.log('[Watcher] 监控已停止');
  return { success: true, message: '监控已停止' };
}

export async function getWatcherStatus(): Promise<{ active: boolean; watchDir: string; scannedCount: number }> {
  const watchDir = await getConfig('watch_dir');
  return {
    active: watcherActive,
    watchDir,
    scannedCount: seenFiles.size,
  };
}

// === 单次手动刮削 ===
export async function scrapeSingle(filePath: string): Promise<{ success: boolean; message: string }> {
  if (!fs.existsSync(filePath)) {
    return { success: false, message: '文件不存在' };
  }
  return await runTmm(filePath);
}

// === 批量刮削指定目录 ===
export async function scrapeDirectory(dirPath: string): Promise<{ success: boolean; message: string }> {
  if (!fs.existsSync(dirPath)) {
    return { success: false, message: '目录不存在' };
  }
  const videos = scanForVideos(dirPath);
  if (videos.length === 0) {
    return { success: false, message: '未找到视频文件' };
  }

  let successCount = 0;
  let failCount = 0;

  for (const video of videos) {
    const result = await runTmm(video);
    if (result.success) successCount++;
    else failCount++;
  }

  return {
    success: true,
    message: `刮削完成：成功 ${successCount}，失败 ${failCount}`,
  };
}
