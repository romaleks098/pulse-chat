import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

export const usersRouter = Router();

usersRouter.get('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  const q = req.query.q as string;
  if (!q || q.trim() === '') {
    return res.json([]);
  }

  const query = `%${q.trim()}%`;
  const currentUserId = req.user!.userId;

  try {
    const users = await db.all(`
      SELECT id, username, display_name, avatar_url, status_text, last_seen
      FROM users
      WHERE (username LIKE ? OR display_name LIKE ?)
        AND id != ?
      LIMIT 20
    `, query, query, currentUserId);

    res.json(users);
  } catch (err) {
    console.error('User search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

usersRouter.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT id, username, display_name, avatar_url, status_text, last_seen
      FROM users
      WHERE id = ?
    `, req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});
