import { Router } from 'express';
import os from 'os';

export const networkRouter = Router();

networkRouter.get('/info', (_req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const netList = interfaces[name];
    if (netList) {
      for (const net of netList) {
        // Skip internal (127.0.0.1) and non-ipv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
  }

  res.json({
    localIp: addresses[0] || 'localhost',
    allIps: addresses,
    clientPort: 5173,
    serverPort: 3001,
  });
});
