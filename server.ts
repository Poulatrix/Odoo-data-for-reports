import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { odooBackendService } from './src/server/odooService';
import { SUPPORTED_MODELS, MODEL_FIELD_DEFINITIONS } from './src/data/odooModels';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body parsing
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Get catalog of pre-configured models
  app.get('/api/odoo/models', (req, res) => {
    res.json({
      success: true,
      models: SUPPORTED_MODELS
    });
  });

  // Test Odoo Connection via XML-RPC
  app.post('/api/odoo/test-connection', async (req, res) => {
    try {
      const { url, db, username, apiKey, isDemo } = req.body;

      if (isDemo) {
        return res.json({
          success: true,
          uid: 2,
          serverVersion: 'Odoo 17.0 Enterprise (Sandbox)',
          serverVersionInfo: [17, 0, 0, 'final', 0, 'e'],
          companyName: 'My Company France & Benelux',
          latencyMs: 18,
          isDemo: true
        });
      }

      if (!url || !db || !username || !apiKey) {
        return res.status(400).json({
          success: false,
          error: 'Veuillez renseigner tous les champs : URL de l\'instance, Base de données, Utilisateur et Clé API.'
        });
      }

      const result = await odooBackendService.testConnection({
        url,
        db,
        username,
        apiKey
      });

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.json({
        ...result,
        isDemo: false
      });
    } catch (err: any) {
      console.error('API /api/odoo/test-connection error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Erreur interne lors de la vérification de la connexion.'
      });
    }
  });

  // Search & Read data from Odoo (or Sandbox mock)
  app.post('/api/odoo/search-read', async (req, res) => {
    try {
      const {
        model,
        domain = [],
        fields = [],
        offset = 0,
        limit = 80,
        order = 'id desc',
        forceRefresh = false,
        credentials,
        isDemo = false
      } = req.body;

      if (!model) {
        return res.status(400).json({
          success: false,
          error: 'Paramètre "model" manquant (ex: sale.order).'
        });
      }

      // Demo mode fallback
      if (isDemo || !credentials || !credentials.url) {
        const mockResult = odooBackendService.getMockSearchRead(
          model,
          domain,
          fields,
          offset,
          limit,
          order
        );
        return res.json({
          success: true,
          model,
          records: mockResult.records,
          totalCount: mockResult.totalCount,
          fields: mockResult.fields,
          fromCache: false,
          executionTimeMs: mockResult.executionTimeMs,
          timestamp: new Date().toISOString(),
          isDemo: true
        });
      }

      // Real Odoo XML-RPC call
      const result = await odooBackendService.searchRead(
        credentials,
        model,
        domain,
        fields,
        offset,
        limit,
        order,
        forceRefresh
      );

      return res.json({
        success: true,
        model,
        records: result.records,
        totalCount: result.totalCount,
        fields: result.fields,
        fromCache: result.fromCache,
        executionTimeMs: result.executionTimeMs,
        timestamp: new Date().toISOString(),
        isDemo: false
      });
    } catch (err: any) {
      console.error('API /api/odoo/search-read error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Erreur lors de la récupération des données Odoo.',
        details: err.stack
      });
    }
  });

  // Fields Get introspection
  app.post('/api/odoo/fields-get', async (req, res) => {
    try {
      const { model, credentials, isDemo = false } = req.body;
      if (!model) {
        return res.status(400).json({ success: false, error: 'Model requis' });
      }

      if (isDemo || !credentials || !credentials.url) {
        const fields = MODEL_FIELD_DEFINITIONS[model] || {};
        return res.json({ success: true, model, fields });
      }

      // We can fetch via searchRead cache or fallback
      const fields = MODEL_FIELD_DEFINITIONS[model] || {};
      return res.json({ success: true, model, fields });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clear Cache
  app.post('/api/odoo/clear-cache', (req, res) => {
    odooBackendService.clearCache();
    res.json({ success: true, message: 'Cache serveur Odoo vidé avec succès.' });
  });

  // Report: Bilan des Affaires à Facturer
  // 1. sale.order (state='sale', invoice_status='to invoice')
  // 2. account.analytic.line (heures prestées)
  // 3. account.move.line (achats facturés comptabilisés parent_state='posted')
  // Supports retroactive date filtering (asOfDate)
  app.post('/api/odoo/report/uninvoiced-orders', async (req, res) => {
    try {
      const { credentials, isDemo = false, forceRefresh = false, asOfDate } = req.body;

      if (isDemo || !credentials || !credentials.url) {
        const mockResult = odooBackendService.getMockUninvoicedOrdersReport(asOfDate);
        return res.json({
          success: true,
          records: mockResult.records,
          totalCount: mockResult.totalCount,
          summary: mockResult.summary,
          fromCache: false,
          executionTimeMs: mockResult.executionTimeMs,
          timestamp: new Date().toISOString(),
          isDemo: true,
          asOfDate
        });
      }

      const result = await odooBackendService.getUninvoicedOrdersReport(credentials, forceRefresh, asOfDate);
      return res.json({
        success: true,
        records: result.records,
        totalCount: result.totalCount,
        summary: result.summary,
        fromCache: result.fromCache,
        executionTimeMs: result.executionTimeMs,
        timestamp: new Date().toISOString(),
        isDemo: false,
        asOfDate
      });
    } catch (err: any) {
      console.error('API /api/odoo/report/uninvoiced-orders error:', err);
      return res.status(500).json({
        success: false,
        records: [],
        totalCount: 0,
        error: err.message || 'Erreur lors de la génération du rapport des affaires à facturer.',
        details: err.stack
      });
    }
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
