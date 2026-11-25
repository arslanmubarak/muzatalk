import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { envConfig } from './src/server/config/env';
import { store } from './src/server/db/store';
import { initSocketServer } from './src/server/socket';
import { apiRouter } from './src/server/routes/api';

async function bootstrap() {
  await store.init();

  const app = express();
  app.set('trust proxy', 1);

  // Helmet security headers tuned to permit AI Studio iframe preview cleanly
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );

  // Origin-checked CORS for unified apimuzatalk.rrgindustry.com frontend + backend
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = new Set([
      'http://apimuzatalk.rrgindustry.com',
      'https://apimuzatalk.rrgindustry.com',
      store.integrations.domains.frontendUrl.replace(/\/$/, ''),
      store.integrations.domains.backendApiUrl.replace(/\/$/, ''),
    ]);
    if (
      origin &&
      (allowedOrigins.has(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.endsWith('.run.app'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', apiRouter);
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const candidateDirs = [
      path.resolve(process.cwd(), 'dist'),
      path.resolve(moduleDir, 'dist'),
      path.resolve(process.cwd(), 'public_html'),
    ];
    const distDir = candidateDirs.find((d) => fs.existsSync(path.join(d, 'index.html'))) || candidateDirs[0];
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(envConfig.port, '0.0.0.0', () => {
    console.log(`MuzTalk full-stack server listening on http://0.0.0.0:${envConfig.port}`);
  });

  const gracefulShutdown = async () => {
    await store.persistNow().catch(() => undefined);
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => {
    void gracefulShutdown();
  });
  process.on('SIGINT', () => {
    void gracefulShutdown();
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
