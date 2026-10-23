import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { initDatabase } from './db.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { conversationsRouter } from './routes/conversations.js';
import { uploadRouter, uploadDir } from './routes/upload.js';
import { networkRouter } from './routes/network.js';
import { setupSocketServer } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
initDatabase();

const app = express();
const server = http.createServer(app);

// Enable CORS for local network and Vite dev server
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/network', networkRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend in production (Single Unified Fullstack Service)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8, // 100MB
});

setupSocketServer(io);

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 PulseChat Server listening on http://0.0.0.0:${PORT}`);
});
