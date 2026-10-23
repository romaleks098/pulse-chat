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
import { syncRouter } from './routes/sync.js';
import { setupSocketServer } from './socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3001',
  'https://pulse-chat-qel7.onrender.com',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'app://',
  'app://localhost',
  'app://pulse',
];

// Enable CORS for web, mobile (Capacitor), and desktop (Electron)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Electron)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.startsWith(allowed))) {
        return callback(null, true);
      }
      // In production or preview, allow all pulse-chat domains
      if (origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint for Keep-Alive and readiness probes
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/network', networkRouter);
app.use('/api/sync', syncRouter);

// Serve client in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  console.log(`[Static] Serving client from ${clientDist}`);
  app.use(express.static(clientDist));

  // SPA fallback for HTML5 History API routing
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
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.startsWith(allowed))) {
        return callback(null, true);
      }
      if (origin.endsWith('.onrender.com')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e8, // 100MB
});

setupSocketServer(io);

const PORT = Number(process.env.PORT) || 3001;

async function startServer() {
  // Initialize Database Schema & Run Migrations
  await initDatabase();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PulseChat Server listening on http://0.0.0.0:${PORT}`);

    // Keep-alive self-ping mechanism to keep Render free tier awake 24/7
    const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || 'https://pulse-chat-qel7.onrender.com';
    console.log(`[Keep-Alive] Service active for: ${PUBLIC_URL}`);

    // Ping every 10 minutes (Render sleeps after 15 minutes of inactivity)
    setInterval(async () => {
      try {
        const pingUrl = `${PUBLIC_URL}/api/health`;
        const res = await fetch(pingUrl);
        console.log(`[Keep-Alive] Pinged ${pingUrl} - Status: ${res.status}`);
      } catch (err: any) {
        console.error('[Keep-Alive] Ping failed:', err.message);
      }
    }, 10 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting PulseChat server:', err);
  process.exit(1);
});
