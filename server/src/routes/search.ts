import { Router } from 'express';
import { searchMedia } from '../services/tmdb';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: '请输入搜索关键词' });

    const page = parseInt(req.query.page as string) || 1;
    const { items, totalPages, totalResults } = await searchMedia(q, page);
    res.json({ items, totalPages, totalResults });
  } catch (err: any) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: '搜索失败' });
  }
});

export default router;
