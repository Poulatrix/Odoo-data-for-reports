import xmlrpc from 'xmlrpc';
import { OdooConnectionCredentials, OdooFieldDefinition } from '../types/odoo';
import { MOCK_DATA } from '../data/mockOdooData';
import { MODEL_FIELD_DEFINITIONS } from '../data/odooModels';

interface CacheEntry {
  data: any;
  timestamp: number;
}

/**
 * Helper to check if an account.analytic.line is a true timesheet (hours prestées)
 * RULE: Any account.analytic.line must be classified as a Timesheet (Feuilles de Temps) and added to Total Hours if:
 * 1. Has an hour unit (UoM contains 'hour' / 'heur' / 'h' / 'hr' / 'hrs') OR category === 'timesheet' OR employee_id is set with non-physical UoM.
 * 2. AND account_id / description / partner does NOT indicate an external purchase, transport, carriage, supplier, or material (e.g. MOU500, PK transport, P-K Transports).
 * 3. AND move_line_id is false/empty (not a linked vendor invoice line).
 * 4. IMPORTANT: user_id alone is NOT a proof of timesheet, because in Odoo ERP user_id is the audit creator on all records!
 */
function isTrueTimesheetAnalyticLine(al: any): boolean {
  // If linked to a vendor invoice (move_line_id), it is a vendor bill line, not a timesheet
  if (al.move_line_id && al.move_line_id !== false) {
    return false;
  }

  // Check partner_id: If a partner is set and it represents a supplier / vendor (e.g. P-K Transports, transporteur, fournisseur), it's not a timesheet
  if (al.partner_id && al.partner_id !== false) {
    const partnerName = (
      Array.isArray(al.partner_id) ? al.partner_id[1] : (typeof al.partner_id === 'string' ? al.partner_id : '')
    ).toUpperCase();
    if (
      partnerName.includes('TRANSPORT') ||
      partnerName.includes('FOURNISSEUR') ||
      partnerName.includes('SUPPLIER') ||
      partnerName.includes('P-K') ||
      partnerName.includes('PK ')
    ) {
      return false;
    }
  }

  // Check description/name for explicit transport, purchases, materials, or hardware supplies
  const desc = String(al.name || '').toUpperCase();
  if (
    desc.includes('TRANSPORT') ||
    desc.includes('PK TRANSPORT') ||
    desc.includes('P-K TRANSPORT') ||
    desc.includes('LIVRAISON') ||
    desc.includes('FRAIS') ||
    desc.includes('PORT ') ||
    desc.includes('ACHAT') ||
    desc.includes('FOURNITURE') ||
    desc.includes('MATERIEL') ||
    desc.includes('MATÉRIEL') ||
    desc.includes('MATIERE') ||
    desc.includes('MATIÈRE') ||
    desc.includes('BOUCHON') ||
    desc.includes('PIECE') ||
    desc.includes('PIÈCE') ||
    desc.includes('COLIS') ||
    desc.includes('MOU500')
  ) {
    return false;
  }

  // Check account_id name or code for explicit purchase/material/transport accounts (e.g. MOU500)
  const accName = (
    Array.isArray(al.account_id) ? al.account_id[1] : (typeof al.account_id === 'string' ? al.account_id : '')
  ).toUpperCase();

  const isMaterialOrPurchaseAccount = (
    accName.includes('MOU500') ||
    accName.includes('ACHAT') ||
    accName.includes('FOURNITURE') ||
    accName.includes('FOURNISSEUR') ||
    accName.includes('STOCK') ||
    accName.includes('MATIERE') ||
    accName.includes('MATIÈRE') ||
    accName.includes('MATERIEL') ||
    accName.includes('MATÉRIEL') ||
    accName.includes('TRANSPORT') ||
    accName.includes('FRAIS')
  );

  if (isMaterialOrPurchaseAccount) {
    return false;
  }

  // Check UoM (Unit of Measure) name
  const uomName = (
    Array.isArray(al.product_uom_id) ? al.product_uom_id[1] : (typeof al.product_uom_id === 'string' ? al.product_uom_id : '')
  ).toLowerCase().trim();

  const isExplicitHourUom = uomName ? (
    uomName.includes('heur') ||
    uomName.includes('hour') ||
    uomName === 'h' ||
    uomName === 'hr' ||
    uomName === 'hrs'
  ) : false;

  const isExplicitPhysicalUom = uomName ? (
    !isExplicitHourUom && (
      uomName.includes('pièce') ||
      uomName.includes('piece') ||
      uomName.includes('unité') ||
      uomName.includes('unite') ||
      uomName.includes('unit') ||
      uomName.includes('bouchon') ||
      uomName.includes('colis') ||
      uomName.includes('kg') ||
      uomName.includes('mètre') ||
      uomName.includes('metre') ||
      uomName.includes('m') ||
      uomName.includes('l') ||
      uomName.includes('litre')
    )
  ) : false;

  if (isExplicitPhysicalUom) {
    return false; // Physical unit => goes to Material / Direct
  }

  // If explicit hour UoM, it is definitely a timesheet
  if (isExplicitHourUom) {
    return true;
  }

  // In Odoo, if category === 'timesheet', it is a timesheet
  if (al.category === 'timesheet') {
    return true;
  }

  // If an employee (hr.employee) is explicitly set and UoM is not physical
  const hasEmployee = Boolean(al.employee_id && al.employee_id !== false);
  if (hasEmployee && !isExplicitPhysicalUom) {
    return true;
  }

  // If task_id is set and unit_amount > 0 and no vendor/purchase indicator
  const hasTask = Boolean(al.task_id && al.task_id !== false);
  if (hasTask && Number(al.unit_amount) > 0 && !isExplicitPhysicalUom) {
    return true;
  }

  // Default: if no explicit hour UoM, no employee, no timesheet category, it is an accounting/analytic line, not a timesheet
  return false;
}

/**
 * Helper to check if an account.analytic.line is a purchase, material, or direct non-hour line
 * (Régulation Pragma / Achats Directs / Transports)
 * Seules les lignes account.analytic.line qui n'ont PAS de notion d'heures (ex: quantité d'unités matérielles,
 * pièces, transports, régulations financières pures sans unité 'Hours') ET sans facture fournisseur liée (move_line_id = False)
 * doivent aller dans cet onglet.
 */
function isPurchaseOrMaterialAnalyticLine(al: any): boolean {
  // 1. Linked to a vendor bill / invoice line (account.move.line)
  if (al.move_line_id && al.move_line_id !== false) {
    return true;
  }

  // If it's a true timesheet, it is NOT purchase/material/pragma
  if (isTrueTimesheetAnalyticLine(al)) {
    return false;
  }

  return true;
}

class OdooBackendService {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlMs = 3 * 60 * 1000; // 3 minutes

  private getCacheKey(prefix: string, payload: any): string {
    return `${prefix}:${JSON.stringify(payload)}`;
  }

  public getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.defaultTtlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  public setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  public clearCache(): void {
    this.cache.clear();
  }

  // Normalize and sanitize Odoo URL to its clean root origin (removes /web, /odoo, queries, trailing slashes)
  public sanitizeUrl(rawUrl: string): string {
    let clean = (rawUrl || '').trim();
    if (!clean) return '';
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    try {
      const parsed = new URL(clean);
      // Strip any /web, /web/login, /odoo or action paths if present
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return clean.replace(/\/+$/, '');
    }
  }

  // Create XML-RPC client for common or object
  private createXmlRpcClient(baseUrl: string, path: string): any {
    const cleanUrl = this.sanitizeUrl(baseUrl);
    const parsed = new URL(cleanUrl);
    const isHttps = parsed.protocol === 'https:';
    const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

    const clientOptions = {
      host: parsed.hostname,
      port,
      path,
      headers: {
        'User-Agent': 'OdooDataTable-SaaS/1.0',
        'Accept': 'text/xml'
      }
    };

    return isHttps 
      ? xmlrpc.createSecureClient(clientOptions)
      : xmlrpc.createClient(clientOptions);
  }

  // Helper promise wrapper for xmlrpc call with friendly error formatting
  private xmlRpcMethodCall(client: any, method: string, params: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      client.methodCall(method, params, (err: any, value: any) => {
        if (err) {
          return reject(err);
        }
        resolve(value);
      });
    });
  }

  // Fallback JSON-RPC call directly over standard HTTP/HTTPS POST
  private async jsonRpcCall(baseUrl: string, service: 'common' | 'object', method: string, args: any[]): Promise<any> {
    const cleanUrl = this.sanitizeUrl(baseUrl);
    const endpoint = `${cleanUrl}/jsonrpc`;

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service,
        method,
        args
      },
      id: Math.floor(Math.random() * 100000)
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OdooDataTable-SaaS/1.0'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    if (!res.ok) {
      throw new Error(`Erreur HTTP Odoo JSON-RPC : ${res.status} ${res.statusText}`);
    }

    const json = await res.json() as any;
    if (json.error) {
      const errDetail = json.error.data?.message || json.error.message || JSON.stringify(json.error);
      throw new Error(`Odoo JSON-RPC Error: ${errDetail}`);
    }

    return json.result;
  }

  // Universal execute_kw wrapper with automatic XML-RPC -> JSON-RPC fallback
  public async executeKw(
    creds: OdooConnectionCredentials,
    uid: number,
    model: string,
    method: string,
    args: any[],
    kwargs: Record<string, any> = {}
  ): Promise<any> {
    const cleanUrl = this.sanitizeUrl(creds.url);
    
    // First try XML-RPC
    try {
      const objectClient = this.createXmlRpcClient(cleanUrl, '/xmlrpc/2/object');
      return await this.xmlRpcMethodCall(objectClient, 'execute_kw', [
        creds.db,
        uid,
        creds.apiKey,
        model,
        method,
        args,
        kwargs
      ]);
    } catch (xmlErr: any) {
      const msg = String(xmlErr?.message || xmlErr);
      const isXmlTagError = msg.includes('Unknown XML-RPC tag') || msg.includes('TITLE') || msg.includes('HTML') || msg.includes('ECONNRESET');
      
      // If it looks like an XML parsing error, HTML redirect or protocol mismatch, try JSON-RPC fallback
      if (isXmlTagError) {
        console.warn(`XML-RPC failed (${msg}), attempting JSON-RPC fallback for ${model}.${method}...`);
        try {
          return await this.jsonRpcCall(cleanUrl, 'object', 'execute_kw', [
            creds.db,
            uid,
            creds.apiKey,
            model,
            method,
            args,
            kwargs
          ]);
        } catch (jsonErr: any) {
          console.error('JSON-RPC fallback also failed:', jsonErr);
          throw this.formatOdooError(jsonErr, creds);
        }
      }
      
      throw this.formatOdooError(xmlErr, creds);
    }
  }

  // Format any raw Odoo error into a clean, human-readable message
  private formatOdooError(err: any, creds: OdooConnectionCredentials): Error {
    const rawMsg = String(err?.message || err || '');

    if (rawMsg.includes('Unknown XML-RPC tag') || rawMsg.includes('TITLE') || rawMsg.includes('HTML')) {
      return new Error(
        `Le serveur Odoo à "${creds.url}" a renvoyé une page HTML au lieu d'une réponse API. Vérifiez que l'URL est bien l'adresse racine (ex: https://votre-instance.odoo.com) et que le protocole https:// est correct.`
      );
    }

    if (rawMsg.includes('Invalid field')) {
      const match = rawMsg.match(/Invalid field ['"]?([^'"]+)['"]?/i);
      const fieldName = match ? match[1] : 'inconnu';
      return new Error(`Le champ technique '${fieldName}' n'existe pas sur ce modèle Odoo pour votre version.`);
    }

    if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('ECONNREFUSED')) {
      return new Error(`Impossible d'accéder au serveur Odoo à "${creds.url}". Vérifiez l'adresse et votre connexion réseau.`);
    }

    if (rawMsg.includes('AccessDenied') || rawMsg.includes('Access Denied') || rawMsg.includes('cannot be authenticated')) {
      return new Error(`Authentification Odoo refusée : vérifiez la base '${creds.db}', l'identifiant '${creds.username}' et la clé d'API.`);
    }

    return new Error(rawMsg);
  }

  // Test Authentication against real Odoo instance (supports XML-RPC and JSON-RPC)
  public async testConnection(creds: OdooConnectionCredentials): Promise<{
    success: boolean;
    uid?: number;
    serverVersion?: string;
    serverVersionInfo?: any[];
    latencyMs?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    const cleanUrl = this.sanitizeUrl(creds.url);

    // 1. Try XML-RPC authentication
    try {
      const commonClient = this.createXmlRpcClient(cleanUrl, '/xmlrpc/2/common');
      
      let versionInfo: any = {};
      try {
        versionInfo = await this.xmlRpcMethodCall(commonClient, 'version', []);
      } catch (verErr) {
        console.warn('Odoo version check XML-RPC non-fatal warning:', verErr);
      }

      const uid = await this.xmlRpcMethodCall(commonClient, 'authenticate', [
        creds.db,
        creds.username,
        creds.apiKey,
        {}
      ]);

      const latencyMs = Date.now() - startTime;

      if (!uid || uid === false || typeof uid !== 'number') {
        return {
          success: false,
          latencyMs,
          error: 'Identifiants invalides : Odoo a rejeté l\'email, le nom de base de données ou la clé d\'API.'
        };
      }

      return {
        success: true,
        uid,
        serverVersion: versionInfo.server_version || 'Odoo Standard',
        serverVersionInfo: versionInfo.server_version_info || [],
        latencyMs
      };
    } catch (err: any) {
      const msg = String(err?.message || err);
      
      // If XML-RPC had HTML or tag parsing error, attempt JSON-RPC
      if (msg.includes('Unknown XML-RPC tag') || msg.includes('TITLE') || msg.includes('HTML')) {
        console.log('XML-RPC returned HTML, attempting JSON-RPC authentication fallback...');
        try {
          let versionInfo: any = {};
          try {
            versionInfo = await this.jsonRpcCall(cleanUrl, 'common', 'version', []);
          } catch {}

          const uid = await this.jsonRpcCall(cleanUrl, 'common', 'authenticate', [
            creds.db,
            creds.username,
            creds.apiKey,
            {}
          ]);

          const latencyMs = Date.now() - startTime;

          if (!uid || uid === false || typeof uid !== 'number') {
            return {
              success: false,
              latencyMs,
              error: 'Identifiants invalides : Odoo a rejeté l\'email, le nom de base de données ou la clé d\'API.'
            };
          }

          return {
            success: true,
            uid,
            serverVersion: versionInfo?.server_version || 'Odoo Standard (JSON-RPC)',
            serverVersionInfo: versionInfo?.server_version_info || [],
            latencyMs
          };
        } catch (jsonErr: any) {
          const latencyMs = Date.now() - startTime;
          return {
            success: false,
            latencyMs,
            error: this.formatOdooError(jsonErr, creds).message
          };
        }
      }

      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        latencyMs,
        error: this.formatOdooError(err, creds).message
      };
    }
  }

  // Inspect existing fields on a model dynamically
  public async getModelFields(
    creds: OdooConnectionCredentials,
    uid: number,
    model: string
  ): Promise<Record<string, OdooFieldDefinition>> {
    const cacheKey = this.getCacheKey(`fields_get:${model}`, { url: creds.url, db: creds.db });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let fieldDefs: Record<string, OdooFieldDefinition> = {};
    try {
      const rawFields = await this.executeKw(
        creds,
        uid,
        model,
        'fields_get',
        [],
        { attributes: ['string', 'type', 'required', 'readonly', 'help', 'selection', 'relation'] }
      );

      if (rawFields && typeof rawFields === 'object') {
        for (const [fName, fMeta] of Object.entries(rawFields as Record<string, any>)) {
          fieldDefs[fName] = {
            name: fName,
            string: fMeta.string || fName,
            type: fMeta.type || 'char',
            required: !!fMeta.required,
            readonly: !!fMeta.readonly,
            help: fMeta.help,
            selection: fMeta.selection,
            relation: fMeta.relation
          };
        }
      }
    } catch (e) {
      console.warn(`fields_get failed for ${model}, using fallback definitions:`, e);
      fieldDefs = MODEL_FIELD_DEFINITIONS[model] || {};
    }

    if (Object.keys(fieldDefs).length > 0) {
      this.setCache(cacheKey, fieldDefs);
    }
    return fieldDefs;
  }

  // Execute search_read on real Odoo instance with resilient field verification
  public async searchRead(
    creds: OdooConnectionCredentials,
    model: string,
    domain: any[] = [],
    fields: string[] = [],
    offset: number = 0,
    limit: number = 80,
    order: string = 'id desc',
    forceRefresh: boolean = false
  ): Promise<{
    records: any[];
    totalCount: number;
    fields: Record<string, OdooFieldDefinition>;
    fromCache: boolean;
    executionTimeMs: number;
  }> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey('searchRead', {
      url: creds.url,
      db: creds.db,
      user: creds.username,
      model,
      domain,
      fields,
      offset,
      limit,
      order
    });

    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // 1. Authenticate to get UID
    const authRes = await this.testConnection(creds);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || 'Échec de l\'authentification Odoo.');
    }
    const uid = authRes.uid;

    // 2. Fetch Field definitions with fields_get
    const fieldDefs = await this.getModelFields(creds, uid, model);
    const existingFieldNames = new Set(Object.keys(fieldDefs));

    // 3. Count total matching records
    let totalCount = 0;
    try {
      totalCount = await this.executeKw(
        creds,
        uid,
        model,
        'search_count',
        [domain],
        {}
      );
    } catch (e) {
      console.warn('search_count failed, will fallback to returned slice length:', e);
    }

    // 4. Filter requested fields to ONLY those that genuinely exist on this Odoo instance
    let safeFields: string[] = [];
    if (fields && fields.length > 0) {
      if (existingFieldNames.size > 0) {
        safeFields = fields.filter(f => existingFieldNames.has(f) || f === 'id');
      } else {
        safeFields = fields;
      }
    }

    const kwargs: any = {
      offset,
      limit,
      order
    };
    if (safeFields.length > 0) {
      kwargs.fields = safeFields;
    }

    let records: any[] = [];
    try {
      records = await this.executeKw(
        creds,
        uid,
        model,
        'search_read',
        [domain],
        kwargs
      );
    } catch (readErr: any) {
      // If an invalid field error still occurred, dynamically strip the offending field and retry
      const errMsg = String(readErr?.message || readErr);
      const invalidFieldMatch = errMsg.match(/Invalid field ['"]?([^'"]+)['"]?/i);
      
      if (invalidFieldMatch && safeFields.length > 0) {
        const badField = invalidFieldMatch[1];
        console.warn(`Detected invalid field '${badField}' on ${model}, retrying search_read without it...`);
        safeFields = safeFields.filter(f => f !== badField);
        kwargs.fields = safeFields;
        records = await this.executeKw(creds, uid, model, 'search_read', [domain], kwargs);
      } else {
        throw readErr;
      }
    }

    const result = {
      records: Array.isArray(records) ? records : [],
      totalCount: typeof totalCount === 'number' && totalCount > 0 ? totalCount : (Array.isArray(records) ? records.length : 0),
      fields: fieldDefs,
      fromCache: false,
      executionTimeMs: Date.now() - startTime
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // Provide mock data for instant sandbox exploration
  public getMockSearchRead(
    model: string,
    domain: any[] = [],
    fields?: string[],
    offset: number = 0,
    limit: number = 80,
    order?: string
  ): {
    records: any[];
    totalCount: number;
    fields: Record<string, OdooFieldDefinition>;
    fromCache: boolean;
    executionTimeMs: number;
  } {
    const rawList = MOCK_DATA[model] || [];
    let processed = [...rawList];

    // Simple domain filtering for demo mode
    if (domain && domain.length > 0) {
      for (const clause of domain) {
        if (Array.isArray(clause) && clause.length === 3) {
          const [field, op, val] = clause;
          processed = processed.filter(item => {
            const itemVal = item[field];
            if (op === '=') {
              if (Array.isArray(itemVal) && typeof val === 'number') return itemVal[0] === val;
              return itemVal === val;
            }
            if (op === '!=') return itemVal !== val;
            if (op === 'ilike') return String(itemVal || '').toLowerCase().includes(String(val || '').toLowerCase());
            if (op === '>') return Number(itemVal) > Number(val);
            if (op === '>=') return Number(itemVal) >= Number(val);
            if (op === '<') return Number(itemVal) < Number(val);
            if (op === '<=') return Number(itemVal) <= Number(val);
            if (op === 'in' && Array.isArray(val)) {
              if (Array.isArray(itemVal)) return val.includes(itemVal[0]);
              return val.includes(itemVal);
            }
            return true;
          });
        }
      }
    }

    // Sort
    if (order) {
      const parts = order.split(' ');
      const sortField = parts[0];
      const sortDir = (parts[1] || 'asc').toLowerCase();
      processed.sort((a, b) => {
        let va = a[sortField];
        let vb = b[sortField];
        if (Array.isArray(va)) va = va[1];
        if (Array.isArray(vb)) vb = vb[1];
        if (va === vb) return 0;
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (sortDir === 'desc') {
          return va < vb ? 1 : -1;
        }
        return va > vb ? 1 : -1;
      });
    }

    const totalCount = processed.length;
    const paginated = processed.slice(offset, offset + limit);

    return {
      records: paginated,
      totalCount,
      fields: MODEL_FIELD_DEFINITIONS[model] || {},
      fromCache: false,
      executionTimeMs: 12
    };
  }

  // Generate the specialized report: "Bilan des Affaires à Facturer"
  // Fully compatible across Odoo 12, 13, 14, 15, 16, 17, 18
  // Supports retroactive analysis at a frozen date (asOfDate)
  public async getUninvoicedOrdersReport(
    creds: OdooConnectionCredentials,
    forceRefresh: boolean = false,
    asOfDate?: string
  ): Promise<{
    records: any[];
    totalCount: number;
    summary: {
      totalOrdersCount: number;
      totalSalesUntaxed: number;
      totalTimesheetHours: number;
      totalPurchasesInvoiced: number;
      totalGrossMargin: number;
      averageMarginRate: number;
    };
    fromCache: boolean;
    executionTimeMs: number;
    asOfDate?: string;
  }> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey('report_uninvoiced_orders', {
      url: creds.url,
      db: creds.db,
      user: creds.username,
      asOfDate: asOfDate || 'all'
    });

    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // 1. Authenticate to get UID
    const authRes = await this.testConnection(creds);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || 'Échec de l\'authentification Odoo.');
    }
    const uid = authRes.uid;

    // 2. Introspect sale.order available fields to ensure version compatibility
    const saleFieldDefs = await this.getModelFields(creds, uid, 'sale.order');
    const existingSaleFields = new Set(Object.keys(saleFieldDefs));

    // Desired candidate fields for sale.order
    const candidateSaleFields = [
      'id',
      'name',
      'partner_id',
      'user_id',
      'amount_untaxed',
      'amount_total',
      'date_order',
      'state',
      'invoice_status',
      'analytic_account_id',    // Odoo <= 15
      'analytic_distribution',  // Odoo 16+
      'project_id',             // If sale_project / project is installed
      'client_order_ref',
      'order_line'
    ];

    // Filter to strictly available fields
    const safeSaleFields = existingSaleFields.size > 0
      ? candidateSaleFields.filter(f => existingSaleFields.has(f) || f === 'id')
      : ['id', 'name', 'partner_id', 'user_id', 'amount_untaxed', 'amount_total', 'date_order', 'state', 'invoice_status'];

    // 3. Step 1: Query Confirmed Uninvoiced Sale Orders
    // Criteria: state = 'sale' AND invoice_status = 'to invoice'
    // If asOfDate is provided, only include orders created/confirmed on or before asOfDate
    const saleDomain: any[] = [
      ['state', '=', 'sale'],
      ['invoice_status', '=', 'to invoice']
    ];
    if (asOfDate) {
      saleDomain.push(['date_order', '<=', `${asOfDate} 23:59:59`]);
    }

    let saleOrders: any[] = [];
    try {
      saleOrders = await this.executeKw(
        creds,
        uid,
        'sale.order',
        'search_read',
        [saleDomain],
        {
          fields: safeSaleFields,
          order: 'date_order desc',
          limit: 200
        }
      );
    } catch (e: any) {
      console.error('Failed to query sale.order for report:', e);
      throw new Error(`Erreur lors de la recherche des commandes de vente : ${e.message}`);
    }

    if (!Array.isArray(saleOrders) || saleOrders.length === 0) {
      const emptyResult = {
        records: [],
        totalCount: 0,
        summary: {
          totalOrdersCount: 0,
          totalSalesUntaxed: 0,
          totalTimesheetHours: 0,
          totalPurchasesInvoiced: 0,
          totalGrossMargin: 0,
          averageMarginRate: 0
        },
        fromCache: false,
        executionTimeMs: Date.now() - startTime
      };
      this.setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    // Extract Order IDs, Names, Project IDs, and Analytic Account IDs across versions
    const orderIds = saleOrders.map(so => so.id);
    const orderNames = saleOrders.map(so => so.name).filter(Boolean);
    
    // Map to track analytic account IDs per sale.order ID
    const orderToAnalyticIds = new Map<number, Set<number>>();
    const allAnalyticAccountIds = new Set<number>();
    const projectToOrderIds = new Map<number, number>();
    const projectIds: number[] = [];

    saleOrders.forEach(so => {
      if (!orderToAnalyticIds.has(so.id)) {
        orderToAnalyticIds.set(so.id, new Set<number>());
      }
      const orderSet = orderToAnalyticIds.get(so.id)!;

      // 1. Direct analytic_account_id on sale.order (Odoo <= 15)
      if (so.analytic_account_id && Array.isArray(so.analytic_account_id) && typeof so.analytic_account_id[0] === 'number') {
        orderSet.add(so.analytic_account_id[0]);
        allAnalyticAccountIds.add(so.analytic_account_id[0]);
      }
      // 2. Odoo 16+ analytic_distribution on sale.order (dict like {"42": 100.0})
      if (so.analytic_distribution && typeof so.analytic_distribution === 'object') {
        Object.keys(so.analytic_distribution).forEach(k => {
          const numId = parseInt(k, 10);
          if (!isNaN(numId)) {
            orderSet.add(numId);
            allAnalyticAccountIds.add(numId);
          }
        });
      }
      // 3. project_id if present
      if (so.project_id && Array.isArray(so.project_id) && typeof so.project_id[0] === 'number') {
        const pId = so.project_id[0];
        projectIds.push(pId);
        projectToOrderIds.set(pId, so.id);
      }
    });

    // 4. Retrieve analytic accounts linked to Projects (project.project)
    if (projectIds.length > 0) {
      try {
        const projFieldDefs = await this.getModelFields(creds, uid, 'project.project');
        const projFieldsSet = new Set(Object.keys(projFieldDefs));
        const candidateProjFields = ['id', 'name', 'analytic_account_id', 'account_id'];
        const safeProjFields = candidateProjFields.filter(f => projFieldsSet.has(f) || f === 'id');

        const projects = await this.executeKw(
          creds,
          uid,
          'project.project',
          'search_read',
          [[['id', 'in', projectIds]]],
          { fields: safeProjFields, limit: projectIds.length }
        );

        if (Array.isArray(projects)) {
          projects.forEach((proj: any) => {
            const orderId = projectToOrderIds.get(proj.id);
            if (orderId && orderToAnalyticIds.has(orderId)) {
              const orderSet = orderToAnalyticIds.get(orderId)!;
              if (proj.analytic_account_id && Array.isArray(proj.analytic_account_id) && typeof proj.analytic_account_id[0] === 'number') {
                orderSet.add(proj.analytic_account_id[0]);
                allAnalyticAccountIds.add(proj.analytic_account_id[0]);
              }
              if (proj.account_id && Array.isArray(proj.account_id) && typeof proj.account_id[0] === 'number') {
                orderSet.add(proj.account_id[0]);
                allAnalyticAccountIds.add(proj.account_id[0]);
              }
            }
          });
        }
      } catch (e) {
        console.warn('Failed to introspect project.project analytic accounts (non-fatal):', e);
      }
    }

    // 5. Retrieve analytic accounts linked to Sale Order Lines (sale.order.line)
    if (orderIds.length > 0) {
      try {
        const solFieldDefs = await this.getModelFields(creds, uid, 'sale.order.line');
        const solFieldsSet = new Set(Object.keys(solFieldDefs));
        const candidateSolFields = ['id', 'order_id', 'analytic_account_id', 'analytic_distribution'];
        const safeSolFields = candidateSolFields.filter(f => solFieldsSet.has(f) || f === 'id');

        const solLines = await this.executeKw(
          creds,
          uid,
          'sale.order.line',
          'search_read',
          [[['order_id', 'in', orderIds]]],
          { fields: safeSolFields, limit: 1000 }
        );

        if (Array.isArray(solLines)) {
          solLines.forEach((line: any) => {
            const orderId = Array.isArray(line.order_id) ? line.order_id[0] : (typeof line.order_id === 'number' ? line.order_id : null);
            if (orderId && orderToAnalyticIds.has(orderId)) {
              const orderSet = orderToAnalyticIds.get(orderId)!;
              if (line.analytic_account_id && Array.isArray(line.analytic_account_id) && typeof line.analytic_account_id[0] === 'number') {
                orderSet.add(line.analytic_account_id[0]);
                allAnalyticAccountIds.add(line.analytic_account_id[0]);
              }
              if (line.analytic_distribution && typeof line.analytic_distribution === 'object') {
                Object.keys(line.analytic_distribution).forEach(k => {
                  const numId = parseInt(k, 10);
                  if (!isNaN(numId)) {
                    orderSet.add(numId);
                    allAnalyticAccountIds.add(numId);
                  }
                });
              }
            }
          });
        }
      } catch (e) {
        console.warn('Failed to introspect sale.order.line analytic accounts (non-fatal):', e);
      }
    }

    const analyticIdsList = Array.from(allAnalyticAccountIds);

    // 6. Step 2: Query Analytic Lines (account.analytic.line) safely
    // Interrogates account.analytic.line for both:
    // - Timesheets (hours prestées)
    // - Manual Analytic Entries (Pragma / Direct costs / Régulations d'encours with move_line_id = False)
    let allAnalyticLines: any[] = [];
    try {
      const aalFieldDefs = await this.getModelFields(creds, uid, 'account.analytic.line');
      const aalFieldsSet = new Set(Object.keys(aalFieldDefs));
      
      const candidateAalFields = [
        'id', 'name', 'unit_amount', 'date', 'user_id', 'employee_id', 
        'account_id', 'so_line', 'project_id', 'task_id', 'amount', 'move_line_id', 
        'category', 'product_uom_id', 'partner_id', 'ref', 'product_id', 'general_account_id'
      ];
      const safeAalFields = aalFieldsSet.size > 0 
        ? candidateAalFields.filter(f => aalFieldsSet.has(f) || f === 'id')
        : ['id', 'name', 'unit_amount', 'date', 'account_id', 'amount'];

      const analyticDomain: any[] = [];
      if (analyticIdsList.length > 0 && aalFieldsSet.has('account_id')) {
        analyticDomain.push(['account_id', 'in', analyticIdsList]);
      } else if (projectIds.length > 0 && aalFieldsSet.has('project_id')) {
        analyticDomain.push(['project_id', 'in', projectIds]);
      }
      if (asOfDate && aalFieldsSet.has('date')) {
        analyticDomain.push(['date', '<=', asOfDate]);
      }

      // If we have an analytic account or project filter, query account.analytic.line
      if (analyticDomain.length > 0) {
        allAnalyticLines = await this.executeKw(
          creds,
          uid,
          'account.analytic.line',
          'search_read',
          [analyticDomain],
          {
            fields: safeAalFields,
            limit: 4000
          }
        );

        // Also harvest any additional account_ids found on analytic lines
        if (Array.isArray(allAnalyticLines)) {
          allAnalyticLines.forEach((al: any) => {
            if (al.account_id && Array.isArray(al.account_id) && typeof al.account_id[0] === 'number') {
              const accId = al.account_id[0];
              allAnalyticAccountIds.add(accId);
              // Associate with order if matching project_id
              if (al.project_id && Array.isArray(al.project_id)) {
                const ordId = projectToOrderIds.get(al.project_id[0]);
                if (ordId && orderToAnalyticIds.has(ordId)) {
                  orderToAnalyticIds.get(ordId)!.add(accId);
                }
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn('account.analytic.line search failed or module not installed (non-fatal):', e);
      allAnalyticLines = [];
    }

    const updatedAnalyticIdsList = Array.from(allAnalyticAccountIds);

    // 7. Step 3: Query Vendor Bill Lines (account.move.line)
    // Make filter specification:
    // [["analytic_line_ids.account_id", "in", [ID_DU_COMPTE_ANALYTIQUE]], ["move_id.move_type", "=", "in_invoice"], ["parent_state", "=", "posted"]]
    let purchaseLines: any[] = [];
    const seenPurchaseLineIds = new Set<number>();

    if (updatedAnalyticIdsList.length > 0) {
      try {
        const amlFieldDefs = await this.getModelFields(creds, uid, 'account.move.line');
        const amlFieldsSet = new Set(Object.keys(amlFieldDefs));

        const candidateAmlFields = [
          'id',
          'name',
          'ref',
          'move_id',
          'partner_id',
          'price_subtotal',
          'debit',
          'credit',
          'analytic_account_id',
          'analytic_distribution',
          'analytic_line_ids',
          'date',
          'parent_state'
        ];
        const safeAmlFields = amlFieldsSet.size > 0
          ? candidateAmlFields.filter(f => amlFieldsSet.has(f) || f === 'id')
          : ['id', 'name', 'ref', 'move_id', 'price_subtotal', 'debit', 'credit'];

        // Primary Query: using analytic_line_ids.account_id (standard Odoo query like Make)
        try {
          const makeDomain: any[] = [
            ['analytic_line_ids.account_id', 'in', updatedAnalyticIdsList],
            ['move_id.move_type', '=', 'in_invoice'],
            ['parent_state', '=', 'posted']
          ];
          if (asOfDate && amlFieldsSet.has('date')) {
            makeDomain.push(['date', '<=', asOfDate]);
          }

          const resMake = await this.executeKw(
            creds,
            uid,
            'account.move.line',
            'search_read',
            [makeDomain],
            {
              fields: safeAmlFields,
              limit: 3000
            }
          );

          if (Array.isArray(resMake)) {
            resMake.forEach(line => {
              if (!seenPurchaseLineIds.has(line.id)) {
                seenPurchaseLineIds.add(line.id);
                purchaseLines.push(line);
              }
            });
          }
        } catch (domainErr) {
          console.warn('Query with analytic_line_ids.account_id fallback:', domainErr);
        }

        // Secondary / Supplemental Query: direct analytic_account_id or analytic_distribution
        if (amlFieldsSet.has('analytic_account_id')) {
          try {
            const directDomain: any[] = [
              ['analytic_account_id', 'in', updatedAnalyticIdsList],
              ['move_id.move_type', '=', 'in_invoice'],
              ['parent_state', '=', 'posted']
            ];
            if (asOfDate && amlFieldsSet.has('date')) {
              directDomain.push(['date', '<=', asOfDate]);
            }

            const resDirect = await this.executeKw(
              creds,
              uid,
              'account.move.line',
              'search_read',
              [directDomain],
              {
                fields: safeAmlFields,
                limit: 3000
              }
            );

            if (Array.isArray(resDirect)) {
              resDirect.forEach(line => {
                if (!seenPurchaseLineIds.has(line.id)) {
                  seenPurchaseLineIds.add(line.id);
                  purchaseLines.push(line);
                }
              });
            }
          } catch (eDirect) {
            console.warn('Query with direct analytic_account_id fallback:', eDirect);
          }
        }

        // Also query if refunds exist or fallback without move_type if unsupported
        if (purchaseLines.length === 0 && amlFieldsSet.has('analytic_account_id')) {
          try {
            const fallbackDomain: any[] = [
              ['analytic_account_id', 'in', updatedAnalyticIdsList],
              ['parent_state', '=', 'posted']
            ];
            if (asOfDate && amlFieldsSet.has('date')) {
              fallbackDomain.push(['date', '<=', asOfDate]);
            }
            const resFallback = await this.executeKw(
              creds,
              uid,
              'account.move.line',
              'search_read',
              [fallbackDomain],
              {
                fields: safeAmlFields,
                limit: 3000
              }
            );
            if (Array.isArray(resFallback)) {
              resFallback.forEach(line => {
                if (!seenPurchaseLineIds.has(line.id)) {
                  seenPurchaseLineIds.add(line.id);
                  purchaseLines.push(line);
                }
              });
            }
          } catch (eFallback) {
            console.warn('Query with fallbackDomain error:', eFallback);
          }
        }

      } catch (e) {
        console.warn('account.move.line search failed for purchases (non-fatal):', e);
        purchaseLines = [];
      }
    }

    // 8. Consolidate Data per Sale Order
    const reportRows = saleOrders.map(so => {
      const orderAnalyticSet = orderToAnalyticIds.get(so.id) || new Set<number>();
      const projectId = so.project_id && Array.isArray(so.project_id) ? so.project_id[0] : null;

      // Filter all matching analytic lines for this sale order
      // Strict date filter: only lines <= asOfDate are kept
      const matchingAnalyticLines = (Array.isArray(allAnalyticLines) ? allAnalyticLines : []).filter(al => {
        if (asOfDate && al.date && String(al.date).slice(0, 10) > asOfDate) {
          return false;
        }
        if (al.account_id && Array.isArray(al.account_id) && orderAnalyticSet.has(al.account_id[0])) {
          return true;
        }
        if (projectId && al.project_id && Array.isArray(al.project_id) && al.project_id[0] === projectId) {
          return true;
        }
        if (al.so_line && Array.isArray(al.so_line) && String(al.so_line[1] || '').includes(so.name)) {
          return true;
        }
        return false;
      });

      // A. Timesheets & Transferts d'encours d'heures (Strict Timesheets Only):
      // Must NOT be a purchase / material line, must NOT have move_line_id, and must match hour context.
      // Odoo stocke les coûts/prestations d'heures avec un montant financier 'amount' NÉGATIF pour les charges (ex: -182,68 € pour 2,5 hrs).
      // - Si 'amount' < 0 (Charge / Heures prestées sur le projet) : unit_amount doit être COMPTABILISÉE EN POSITIF (+).
      // - Si 'amount' > 0 (Régulation / Transfert d'heures hors du projet) : unit_amount doit être COMPTABILISÉE EN NÉGATIF (-) pour se déduire du total du projet.
      // effective_hours = (amount > 0) ? -Math.abs(unit_amount) : Math.abs(unit_amount)
      const orderTimesheets = matchingAnalyticLines.filter(al => {
        return isTrueTimesheetAnalyticLine(al);
      }).map(al => {
        const unitAmount = Number(al.unit_amount) || 0;
        const amountVal = Number(al.amount) || 0;
        const effectiveHours = (amountVal > 0) ? -Math.abs(unitAmount) : Math.abs(unitAmount);

        return {
          id: al.id,
          name: al.name || 'Feuille de temps',
          unit_amount: effectiveHours,
          effective_hours: effectiveHours,
          date: al.date || '',
          user_id: al.user_id || false,
          employee_id: al.employee_id || false,
          account_id: al.account_id || false,
          task_id: al.task_id || false,
          product_uom_id: al.product_uom_id || false,
          amount: amountVal
        };
      });

      const totalHours = Math.round(orderTimesheets.reduce((sum, ts) => sum + (ts.effective_hours !== undefined ? ts.effective_hours : ts.unit_amount), 0) * 100) / 100;

      // B. Manual Analytic Lines (Achats matériel direct, Pragma, encours, direct costs):
      // - move_line_id is false/null/undefined (never linked to a vendor invoice account.move.line to avoid double counting)
      // - NOT a true timesheet line (e.g. MOU500, hardware UoM, 35 bouchons, 1 raccord, Pragma régulation)
      // - amount is non-zero (in Odoo, costs are stored as negative numbers, e.g. -16 000,00 €) or non-zero material quantity
      const orderManualAnalyticLines = matchingAnalyticLines.filter(al => {
        const isMoveLinked = Boolean(al.move_line_id && al.move_line_id !== false);
        if (isMoveLinked) return false;

        if (isTrueTimesheetAnalyticLine(al)) return false;

        const rawAmount = Number(al.amount) || 0;
        const unitAmount = Number(al.unit_amount) || 0;
        if (rawAmount === 0 && unitAmount === 0) return false;

        return true;
      }).map(al => {
        const rawAmount = Number(al.amount) || 0;
        // In Odoo, cost/expense is negative (e.g. -16000.00 €). We take absolute magnitude for cost calculation:
        const costAmount = Math.abs(rawAmount);
        const isMaterial = isPurchaseOrMaterialAnalyticLine(al);
        return {
          id: al.id,
          name: al.name || (isMaterial ? 'Achat matériel / fournitures' : 'Écriture analytique directe / Pragma'),
          amount: costAmount,
          rawAmount: rawAmount,
          date: al.date || '',
          user_id: al.user_id || false,
          employee_id: al.employee_id || false,
          account_id: al.account_id || false,
          project_id: al.project_id || false,
          task_id: al.task_id || false,
          product_uom_id: al.product_uom_id || false,
          unit_amount: al.unit_amount || 0,
          category: al.category || (isMaterial ? 'material' : 'manual'),
          move_line_id: al.move_line_id || false,
          partner_id: al.partner_id || false,
          ref: al.ref ? String(al.ref) : ''
        };
      });

      // Filter matching vendor bills (achats facturés comptabilisés)
      // Strict date filter: only posted invoices with date <= asOfDate are kept
      const orderPurchases = (Array.isArray(purchaseLines) ? purchaseLines : []).filter(pl => {
        if (asOfDate && pl.date && String(pl.date).slice(0, 10) > asOfDate) {
          return false;
        }
        // Match by analytic_account_id
        if (pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && orderAnalyticSet.has(pl.analytic_account_id[0])) {
          return true;
        }
        // Match by analytic_distribution
        if (pl.analytic_distribution && typeof pl.analytic_distribution === 'object') {
          const keys = Object.keys(pl.analytic_distribution);
          for (const k of keys) {
            const numK = parseInt(k, 10);
            if (!isNaN(numK) && orderAnalyticSet.has(numK)) {
              return true;
            }
          }
        }
        // If order has only 1 analytic account and purchase line was returned by query
        if (orderAnalyticSet.size > 0 && purchaseLines.length > 0) {
          // If the line has analytic_account_id matching
          if (pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && orderAnalyticSet.has(pl.analytic_account_id[0])) {
            return true;
          }
        }
        return false;
      });

      // Sum of vendor bills
      const vendorBillsTotal = orderPurchases.reduce((sum, pl) => {
        const val = pl.price_subtotal !== undefined && pl.price_subtotal !== null && Number(pl.price_subtotal) !== 0
          ? Number(pl.price_subtotal)
          : (Number(pl.debit) || 0);
        return sum + val;
      }, 0);

      // Sum of direct manual analytic costs (Pragma / encours)
      const manualAnalyticCostsTotal = orderManualAnalyticLines.reduce((sum, mal) => sum + mal.amount, 0);

      // Total purchases / direct costs: Factures Fournisseurs + Écritures Analytiques Directes
      const totalPurchases = vendorBillsTotal + manualAnalyticCostsTotal;

      const amountUntaxed = Number(so.amount_untaxed) || 0;
      const amountTotal = Number(so.amount_total) || 0;
      const grossMargin = amountUntaxed - totalPurchases;
      const marginRate = amountUntaxed > 0 ? (grossMargin / amountUntaxed) * 100 : 0;
      const hourlyMarginRate = totalHours > 0 ? grossMargin / totalHours : 0;

      // 2 Hourly Valuations requested by user:
      // 1. Total hours * 77.76 €/h
      // 2. Total hours * 90.00 €/h
      const valuation77_76 = Math.round(totalHours * 77.76 * 100) / 100;
      const valuation90 = Math.round(totalHours * 90.00 * 100) / 100;

      const partnerName = Array.isArray(so.partner_id) ? so.partner_id[1] : (so.partner_id || 'Client inconnu');
      const clientDisplay = `${so.name} - ${partnerName}`;

      // Pick representative analytic account display
      let displayAnalytic: [number, string] | false = false;
      if (so.analytic_account_id && Array.isArray(so.analytic_account_id)) {
        displayAnalytic = so.analytic_account_id;
      } else if (orderAnalyticSet.size > 0) {
        const firstId = Array.from(orderAnalyticSet)[0];
        displayAnalytic = [firstId, `Compte Analytique #${firstId}`];
      }

      return {
        id: so.id,
        name: so.name,
        partner_id: Array.isArray(so.partner_id) ? so.partner_id : [0, String(so.partner_id || 'Client')],
        clientDisplay,
        amount_untaxed: amountUntaxed,
        amount_total: amountTotal,
        date_order: so.date_order,
        user_id: so.user_id,
        analytic_account_id: displayAnalytic,
        project_id: so.project_id,
        state: so.state,
        invoice_status: so.invoice_status,
        totalHours: Math.round(totalHours * 10) / 10,
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        vendorBillsTotal: Math.round(vendorBillsTotal * 100) / 100,
        manualAnalyticCostsTotal: Math.round(manualAnalyticCostsTotal * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        marginRate: Math.round(marginRate * 10) / 10,
        hourlyMarginRate: Math.round(hourlyMarginRate * 100) / 100,
        valuation77_76,
        valuation90,
        timesheets: orderTimesheets,
        vendorBills: orderPurchases,
        manualAnalyticLines: orderManualAnalyticLines
      };
    });

    // Sort report rows descending by reference/order name (e.g. FMF269999, fmf260811, SO/2026/00135, etc.)
    reportRows.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }));

    // Compute executive totals
    const totalSalesUntaxed = reportRows.reduce((acc, row) => acc + row.amount_untaxed, 0);
    const totalTimesheetHours = reportRows.reduce((acc, row) => acc + row.totalHours, 0);
    const totalPurchasesInvoiced = reportRows.reduce((acc, row) => acc + row.totalPurchases, 0);
    const totalVendorBills = reportRows.reduce((acc, row) => acc + (row.vendorBillsTotal || 0), 0);
    const totalManualAnalyticCosts = reportRows.reduce((acc, row) => acc + (row.manualAnalyticCostsTotal || 0), 0);
    const totalGrossMargin = totalSalesUntaxed - totalPurchasesInvoiced;
    const averageMarginRate = totalSalesUntaxed > 0 ? (totalGrossMargin / totalSalesUntaxed) * 100 : 0;
    const totalValuation77_76 = Math.round(totalTimesheetHours * 77.76 * 100) / 100;
    const totalValuation90 = Math.round(totalTimesheetHours * 90.00 * 100) / 100;

    const finalResult = {
      records: reportRows,
      totalCount: reportRows.length,
      summary: {
        totalOrdersCount: reportRows.length,
        totalSalesUntaxed: Math.round(totalSalesUntaxed * 100) / 100,
        totalTimesheetHours: Math.round(totalTimesheetHours * 10) / 10,
        totalPurchasesInvoiced: Math.round(totalPurchasesInvoiced * 100) / 100,
        totalVendorBills: Math.round(totalVendorBills * 100) / 100,
        totalManualAnalyticCosts: Math.round(totalManualAnalyticCosts * 100) / 100,
        totalGrossMargin: Math.round(totalGrossMargin * 100) / 100,
        averageMarginRate: Math.round(averageMarginRate * 10) / 10,
        totalValuation77_76,
        totalValuation90
      },
      fromCache: false,
      executionTimeMs: Date.now() - startTime
    };

    this.setCache(cacheKey, finalResult);
    return finalResult;
  }

  // Provide mock report for sandbox demo mode
  public getMockUninvoicedOrdersReport(asOfDate?: string): {
    records: any[];
    totalCount: number;
    summary: {
      totalOrdersCount: number;
      totalSalesUntaxed: number;
      totalTimesheetHours: number;
      totalPurchasesInvoiced: number;
      totalVendorBills: number;
      totalManualAnalyticCosts: number;
      totalGrossMargin: number;
      averageMarginRate: number;
      totalValuation77_76: number;
      totalValuation90: number;
    };
    fromCache: boolean;
    executionTimeMs: number;
    asOfDate?: string;
  } {
    let saleOrders = (MOCK_DATA['sale.order'] || []).filter(
      so => so.state === 'sale' && so.invoice_status === 'to invoice'
    );
    if (asOfDate) {
      saleOrders = saleOrders.filter(so => !so.date_order || String(so.date_order).slice(0, 10) <= asOfDate);
    }

    let analyticLines = MOCK_DATA['account.analytic.line'] || [];
    if (asOfDate) {
      analyticLines = analyticLines.filter(al => !al.date || String(al.date).slice(0, 10) <= asOfDate);
    }

    let purchaseLines = (MOCK_DATA['account.move.line'] || []).filter(
      pl => pl.parent_state === 'posted'
    );
    if (asOfDate) {
      purchaseLines = purchaseLines.filter(pl => !pl.date || String(pl.date).slice(0, 10) <= asOfDate);
    }

    const reportRows = saleOrders.map(so => {
      const analyticId = Array.isArray(so.analytic_account_id) ? so.analytic_account_id[0] : null;

      const matchingAnalytic = analyticLines.filter(al => {
        if (analyticId && al.account_id && Array.isArray(al.account_id) && al.account_id[0] === analyticId) {
          return true;
        }
        if (al.so_line && Array.isArray(al.so_line) && String(al.so_line[1] || '').includes(so.name)) {
          return true;
        }
        return false;
      });

      // Timesheets & Transferts d'encours d'heures:
      // Odoo: amount < 0 => charge (+) | amount > 0 => régulation/transfert (-)
      const orderTimesheets = matchingAnalytic.filter(al => {
        return isTrueTimesheetAnalyticLine(al);
      }).map(al => {
        const unitAmount = Number(al.unit_amount) || 0;
        const amountVal = Number(al.amount) || 0;
        const effectiveHours = (amountVal > 0) ? -Math.abs(unitAmount) : Math.abs(unitAmount);

        return {
          id: al.id,
          name: al.name || 'Feuille de temps',
          unit_amount: effectiveHours,
          effective_hours: effectiveHours,
          date: al.date || '',
          user_id: al.user_id || false,
          employee_id: al.employee_id || false,
          account_id: al.account_id || false,
          task_id: al.task_id || false,
          product_uom_id: al.product_uom_id || false,
          amount: amountVal
        };
      });

      const totalHours = Math.round(orderTimesheets.reduce((sum, ts) => sum + (ts.effective_hours !== undefined ? ts.effective_hours : ts.unit_amount), 0) * 100) / 100;

      // Manual analytic direct costs (Pragma / encours / direct expenses / achats matériel sans facture)
      const orderManualAnalyticLines = matchingAnalytic.filter(al => {
        const isMoveLinked = Boolean(al.move_line_id && al.move_line_id !== false);
        if (isMoveLinked) return false;

        if (isTrueTimesheetAnalyticLine(al)) return false;

        const rawAmount = Number(al.amount) || 0;
        const unitAmount = Number(al.unit_amount) || 0;
        if (rawAmount === 0 && unitAmount === 0) return false;

        return true;
      }).map(al => {
        const rawAmount = Number(al.amount) || 0;
        const costAmount = Math.abs(rawAmount);
        const isMaterial = isPurchaseOrMaterialAnalyticLine(al);
        return {
          id: al.id,
          name: al.name || (isMaterial ? 'Achat matériel / fournitures' : 'Écriture analytique directe / Pragma'),
          amount: costAmount,
          rawAmount: rawAmount,
          date: al.date || '',
          user_id: al.user_id || false,
          employee_id: al.employee_id || false,
          account_id: al.account_id || false,
          project_id: al.project_id || false,
          task_id: al.task_id || false,
          product_uom_id: al.product_uom_id || false,
          unit_amount: al.unit_amount || 0,
          category: al.category || (isMaterial ? 'material' : 'manual'),
          move_line_id: al.move_line_id || false,
          partner_id: al.partner_id || false,
          ref: al.ref ? String(al.ref) : ''
        };
      });

      // Vendor bills
      const orderPurchases = purchaseLines.filter(pl => {
        if (analyticId && pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && pl.analytic_account_id[0] === analyticId) {
          return true;
        }
        return false;
      });

      const vendorBillsTotal = orderPurchases.reduce((sum, pl) => sum + (Number(pl.price_subtotal) || 0), 0);
      const manualAnalyticCostsTotal = orderManualAnalyticLines.reduce((sum, mal) => sum + mal.amount, 0);
      const totalPurchases = vendorBillsTotal + manualAnalyticCostsTotal;

      const amountUntaxed = Number(so.amount_untaxed) || 0;
      const amountTotal = Number(so.amount_total) || 0;
      const grossMargin = amountUntaxed - totalPurchases;
      const marginRate = amountUntaxed > 0 ? (grossMargin / amountUntaxed) * 100 : 0;
      const hourlyMarginRate = totalHours > 0 ? grossMargin / totalHours : 0;

      const valuation77_76 = Math.round(totalHours * 77.76 * 100) / 100;
      const valuation90 = Math.round(totalHours * 90.00 * 100) / 100;

      const partnerName = Array.isArray(so.partner_id) ? so.partner_id[1] : (so.partner_id || 'Client inconnu');
      const clientDisplay = `${so.name} - ${partnerName}`;

      return {
        id: so.id,
        name: so.name,
        partner_id: Array.isArray(so.partner_id) ? so.partner_id : [0, String(so.partner_id || 'Client')],
        clientDisplay,
        amount_untaxed: amountUntaxed,
        amount_total: amountTotal,
        date_order: so.date_order,
        user_id: so.user_id,
        analytic_account_id: so.analytic_account_id,
        project_id: so.project_id,
        state: so.state,
        invoice_status: so.invoice_status,
        totalHours: Math.round(totalHours * 10) / 10,
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        vendorBillsTotal: Math.round(vendorBillsTotal * 100) / 100,
        manualAnalyticCostsTotal: Math.round(manualAnalyticCostsTotal * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        marginRate: Math.round(marginRate * 10) / 10,
        hourlyMarginRate: Math.round(hourlyMarginRate * 100) / 100,
        valuation77_76,
        valuation90,
        timesheets: orderTimesheets,
        vendorBills: orderPurchases,
        manualAnalyticLines: orderManualAnalyticLines
      };
    });

    // Sort mock records descending by reference name (e.g. FMF269999, fmf260811, SO/2026/00135, etc.)
    reportRows.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }));

    const totalSalesUntaxed = reportRows.reduce((acc, row) => acc + row.amount_untaxed, 0);
    const totalTimesheetHours = reportRows.reduce((acc, row) => acc + row.totalHours, 0);
    const totalPurchasesInvoiced = reportRows.reduce((acc, row) => acc + row.totalPurchases, 0);
    const totalVendorBills = reportRows.reduce((acc, row) => acc + (row.vendorBillsTotal || 0), 0);
    const totalManualAnalyticCosts = reportRows.reduce((acc, row) => acc + (row.manualAnalyticCostsTotal || 0), 0);
    const totalGrossMargin = totalSalesUntaxed - totalPurchasesInvoiced;
    const averageMarginRate = totalSalesUntaxed > 0 ? (totalGrossMargin / totalSalesUntaxed) * 100 : 0;
    const totalValuation77_76 = Math.round(totalTimesheetHours * 77.76 * 100) / 100;
    const totalValuation90 = Math.round(totalTimesheetHours * 90.00 * 100) / 100;

    return {
      records: reportRows,
      totalCount: reportRows.length,
      summary: {
        totalOrdersCount: reportRows.length,
        totalSalesUntaxed: Math.round(totalSalesUntaxed * 100) / 100,
        totalTimesheetHours: Math.round(totalTimesheetHours * 10) / 10,
        totalPurchasesInvoiced: Math.round(totalPurchasesInvoiced * 100) / 100,
        totalVendorBills: Math.round(totalVendorBills * 100) / 100,
        totalManualAnalyticCosts: Math.round(totalManualAnalyticCosts * 100) / 100,
        totalGrossMargin: Math.round(totalGrossMargin * 100) / 100,
        averageMarginRate: Math.round(averageMarginRate * 10) / 10,
        totalValuation77_76,
        totalValuation90
      },
      fromCache: false,
      executionTimeMs: 14
    };
  }
}

export const odooBackendService = new OdooBackendService();
