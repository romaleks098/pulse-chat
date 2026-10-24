import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

export const uploadRouter = Router();

uploadRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const isImage = req.file.mimetype.startsWith('image/');
  const fileUrl = `/uploads/${req.file.filename}`;

  // Persist binary data into PostgreSQL / SQLite media_files table so ephemeral Render restarts don't lose media
  try {
    const buffer = await fs.promises.readFile(req.file.path);
    await db.run(
      'INSERT INTO media_files (filename, mime_type, data, size) VALUES (?, ?, ?, ?) ON CONFLICT (filename) DO UPDATE SET data = excluded.data, size = excluded.size',
      req.file.filename,
      req.file.mimetype,
      buffer,
      req.file.size
    );
  } catch (err: any) {
    console.warn('[Upload] Could not persist media file into DB:', err.message);
  }

  res.json({
    url: fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    type: isImage ? 'image' : 'file',
  });
});
