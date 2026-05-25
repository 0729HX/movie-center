import { Router } from 'express';
import { query } from '../db';

const router = Router();

// 获取所有配置
router.get('/', async (_req, res) => {
  try {
    const rows: any[] = await query('SELECT `key`, `value` FROM config');
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: '获取配置失败' });
  }
});

// 更新配置
router.put('/', async (req, res) => {
  try {
    const updates: Record<string, string> = req.body;
    const allowedKeys = ['potplayer_path', 'media_root', 'tmdb_api_key', 'omdb_api_key', 'tmm_path', 'tmm_args', 'watch_dir', 'output_dir'];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        await query(
          'INSERT INTO config (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
          [key, value, value]
        );
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: '更新配置失败' });
  }
});

export default router;
