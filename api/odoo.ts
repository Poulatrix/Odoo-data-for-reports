import type { IncomingMessage, ServerResponse } from 'http';
import { handleOdooRequest, OdooProxyRequest } from './_lib/odooController.js';

interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: any;
  method?: string;
}

interface VercelResponse extends ServerResponse {
  status: (statusCode: number) => VercelResponse;
  json: (data: any) => void;
  send: (body: any) => void;
  setHeader: (name: string, value: string | number | readonly string[]) => this;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Enable Global CORS for Vercel
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Handle browser pre-flight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    let payload: OdooProxyRequest = {};

    if (req.method === 'GET') {
      const queryAction = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
      payload = {
        action: queryAction || 'models',
        ...req.query
      };
    } else {
      // Body can be string or parsed JSON object depending on runtime
      if (typeof req.body === 'string') {
        try {
          payload = JSON.parse(req.body);
        } catch {
          payload = {};
        }
      } else if (req.body && typeof req.body === 'object') {
        payload = req.body;
      }

      // Query param fallback for action (e.g. /api/odoo?action=test-connection)
      if (!payload.action && req.query?.action) {
        payload.action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
      }
    }

    const { status, body } = await handleOdooRequest(payload);
    return res.status(status).json(body);
  } catch (err: any) {
    console.error('[Vercel Serverless Function Error /api/odoo]:', err);
    return res.status(400).json({
      success: false,
      error: err?.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL et vos identifiants.',
      timestamp: new Date().toISOString()
    });
  }
}
