import { Router } from 'express';
import { db, getServerEpoch } from '../db.js';
import { requireAuth, AuthenticatedRequest } from '../auth.js';

export const syncRouter = Router();

// GET /api/sync?since=<seq>&epoch=<epoch>
syncRouter.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.userId;
  const since = Number(req.query.since) || 0;
  const clientEpoch = req.query.epoch ? String(req.query.epoch) : null;

  try {
    const serverEpoch = getServerEpoch();

    // Query maximum sequence number currently in sync_events
    const maxRow = db.prepare('SELECT MAX(seq) as max_seq FROM sync_events').get() as any;
    const latestSeq = maxRow?.max_seq || 0;

    // Full resync condition:
    // 1. Client has different epoch (e.g. server/database restarted or reset)
    // 2. Client is asking for since=0 (initial sync)
    // 3. Client's since is ahead of server's latestSeq
    if (!clientEpoch || clientEpoch !== serverEpoch || since === 0 || since > latestSeq) {
      return res.json({
        fullResyncRequired: true,
        epoch: serverEpoch,
        latestSeq,
        events: [],
      });
    }

    // Query delta events for this user since last known seq
    const rawEvents = db.prepare(`
      SELECT seq, user_id, conversation_id, event_type, payload, created_at
      FROM sync_events
      WHERE seq > ?
        AND (
          user_id = ?
          OR user_id IS NULL
          OR conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?)
        )
      ORDER BY seq ASC
      LIMIT 250
    `).all(since, userId, userId) as any[];

    const events = rawEvents.map((r) => {
      let data = null;
      try {
        data = JSON.parse(r.payload);
      } catch {
        data = r.payload;
      }
      return {
        seq: r.seq,
        conversationId: r.conversation_id,
        eventType: r.event_type,
        data,
        createdAt: r.created_at,
      };
    });

    res.json({
      fullResyncRequired: false,
      epoch: serverEpoch,
      latestSeq,
      events,
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});
