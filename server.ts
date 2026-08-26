import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { handleOdooRequest } from './src/server/odooController';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parsing with generous limit
  app.use(express.json({ limit: '10mb' }));

  // Global CORS & JSON Headers for API routes
  app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).json({ ok: true });
    }
    next();
  });

  // Health check
  app.get('/api/health', async (req, res) => {
    const { status, body } = await handleOdooRequest({ action: 'health' });
    res.status(status).json(body);
  });

  // Universal Odoo API Proxy Route (/api/odoo)
  app.all('/api/odoo', async (req, res) => {
    const payload = req.method === 'GET' ? { ...req.query } : { ...req.body };
    const { status, body } = await handleOdooRequest(payload);
    return res.status(status).json(body);
  });

  // Get catalog of pre-configured models
  app.get('/api/odoo/models', async (req, res) => {
    const { status, body } = await handleOdooRequest({ action: 'models' });
    return res.status(status).json(body);
  });

  // Test Odoo Connection via XML-RPC / JSON-RPC
  app.post('/api/odoo/test-connection', async (req, res) => {
    const { status, body } = await handleOdooRequest(req.body, 'test-connection');
    return res.status(status).json(body);
  });

  // Search & Read data from Odoo (or Sandbox mock)
  app.post('/api/odoo/search-read', async (req, res) => {
    const { status, body } = await handleOdooRequest(req.body, 'search-read');
    return res.status(status).json(body);
  });

  // Fields Get introspection
  app.post('/api/odoo/fields-get', async (req, res) => {
    const { status, body } = await handleOdooRequest(req.body, 'fields-get');
    return res.status(status).json(body);
  });

  // Clear Cache
  app.post('/api/odoo/clear-cache', async (req, res) => {
    const { status, body } = await handleOdooRequest(req.body, 'clear-cache');
    return res.status(status).json(body);
  });

  // Report: Bilan des Affaires à Facturer
  app.post('/api/odoo/report/uninvoiced-orders', async (req, res) => {
    const { status, body } = await handleOdooRequest(req.body, 'report/uninvoiced-orders');
    return res.status(status).json(body);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Odoo DataTable SaaS server running on port ${PORT}`);
  });
}

startServer();
