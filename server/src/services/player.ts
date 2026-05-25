import { exec } from 'child_process';
import { query } from '../db';
import path from 'path';

/**
 * 使用 PotPlayer 播放本地媒体文件
 */
export async function playWithPotPlayer(localPath: string): Promise<{ success: boolean; message: string }> {
  try {
    // 从数据库获取 PotPlayer 路径
    const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['potplayer_path']);
    const playerPath = rows[0]?.value;

    if (!playerPath) {
      return { success: false, message: '未配置 PotPlayer 路径，请在设置中配置' };
    }

    // 检查文件是否存在
    const fs = await import('fs');
    if (!fs.existsSync(localPath)) {
      return { success: false, message: `文件不存在: ${localPath}` };
    }

    return new Promise((resolve) => {
      // Windows 下用 start 或直接调用
      const cmd = process.platform === 'win32'
        ? `"${playerPath}" "${localPath}"`
        : `"${playerPath}" "${localPath}" &`;

      exec(cmd, (error) => {
        if (error) {
          resolve({ success: false, message: `启动播放器失败: ${error.message}` });
        } else {
          resolve({ success: true, message: '正在播放...' });
        }
      });
    });
  } catch (err: any) {
    return { success: false, message: `播放出错: ${err.message}` };
  }
}
