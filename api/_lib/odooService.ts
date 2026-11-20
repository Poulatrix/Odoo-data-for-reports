import xmlrpc from 'xmlrpc';
import { MOCK_DATA } from './mockOdooData.js';
import { MODEL_FIELD_DEFINITIONS } from './odooModels.js';

export interface OdooConnectionCredentials {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

export interface OdooFieldDefinition {
  name: string;
  string: string;
  type: string;
  required?: boolean;
  readonly?: boolean;
  help?: string;
  selection?: [string | number, string][];
  relation?: string;
}

export type MouldWeightStatus = 'ANOMALIE' | 'CONFORME';

export interface MouldWeightCheckItem {
  id: string;
  orderId: number;
  orderName: string;
  clientOrderRef?: string;
  orderDate?: string;
  partnerId: number;
  partnerName: string;
  lineId: number;
  lineName?: string;
  productId: number;
  productName: string;
  productDefaultCode?: string;
  productTmplId?: number;
  tagNames: string[];
  tagDisplay: string;
  weight: number;
  hasWeight: boolean;
  status: MouldWeightStatus;
  statusLabel: string;
  odooProductUrl?: string;
  odooOrderUrl?: string;
}

export interface MouldWeightCheckSummary {
  totalOrdersCount: number;
  totalProductsCount: number;
  anomaliesCount: number;
  compliantCount: number;
  complianceRate: number;
}

interface CacheEntry {
  data: any;
  timestamp: number;
}

/**
 * Strict 3-Branch Exclusive Classifier for account.analytic.line:
 * 
 * BRANCHE 1 : FEUILLES DE TEMPS (HEURES) -> "Total Heures Prestées"
 * SI :
 * - account_id.name ne contient pas 'MOU500' (ni autre compte d'achat/fourniture).
 * - ET (unit_amount != 0 avec unité de temps 'Hours' OU un intervenant/employé est renseigné OU category === 'timesheet').
 * -> Action : Additionner unit_amount aux heures et NE PAS ajouter dans Pragma.
 * 
 * BRANCHE 2 : FACTURES FOURNISSEURS & ACHATS MATÉRIEL -> "Factures Fournisseurs (€ HT)"
 * SI :
 * - move_line_id n'est pas vide (Facture fournisseur liée).
 * - OU purchase_line_id n'est pas vide (Bon de commande d'achat lié).
 * - OU account_id.name contient 'MOU500' ou est identifié comme un compte d'achat fournisseur / sous-traitance externe.
 * -> Action : Additionner le montant à "Factures Fournisseurs (€ HT)" et EXCLURE de Pragma.
 * 
 * BRANCHE 3 : PRAGMAS / RÉGULATIONS DIRECTES (RÉSIDUEL) -> "Écritures Analytiques Directes / Pragma (€ HT)"
 * QUE LES LIGNES QUI :
 * - N'ont AUCUNE facture ou commande d'achat liée (move_line_id = False ET purchase_line_id = False).
 * - NE SONT PAS des heures (pas d'unité 'Hours', pas d'intervenant de main-d'œuvre).
 * - Sont des régulations directes d'encours ou ajustements comptables manuels sans pièce justificative fournisseur.
 */
export type AnalyticBranch = 'timesheet' | 'vendor_bill' | 'pragma';

export function classifyAnalyticLine(al: any): AnalyticBranch {
  // Check linked vendor bill or purchase order line
  const hasMoveLine = Boolean(
    al.move_line_id && al.move_line_id !== false && (Array.isArray(al.move_line_id) ? al.move_line_id[0] : al.move_line_id)
  );
  const hasPurchaseLine = Boolean(
    al.purchase_line_id && al.purchase_line_id !== false && (Array.isArray(al.purchase_line_id) ? al.purchase_line_id[0] : al.purchase_line_id)
  );

  const accName = (
    Array.isArray(al.account_id) ? al.account_id[1] : (typeof al.account_id === 'string' ? al.account_id : '')
  ).toUpperCase();

  const genAccName = (
    Array.isArray(al.general_account_id) ? al.general_account_id[1] : (typeof al.general_account_id === 'string' ? al.general_account_id : '')
  ).toUpperCase();

  const isMaterialOrPurchaseAccount = (
    accName.includes('MOU500') ||
    accName.includes('ACHAT') ||
    accName.includes('FOURNISSEUR') ||
    accName.includes('FOURNITURE') ||
    accName.includes('SOUS-TRAITANCE') ||
    accName.includes('SOUS TRAITANCE') ||
    accName.includes('SOUS_TRAITANCE') ||
    accName.includes('STOCK') ||
    accName.includes('MATIERE') ||
    accName.includes('MATIÈRE') ||
    accName.includes('MATERIEL') ||
    accName.includes('MATÉRIEL') ||
    genAccName.startsWith('60') ||
    genAccName.startsWith('61') ||
    genAccName.startsWith('62')
  );

  // BRANCHE 2 : FACTURES FOURNISSEURS & ACHATS MATÉRIEL
  if (
    hasMoveLine ||
    hasPurchaseLine ||
    isMaterialOrPurchaseAccount ||
    al.category === 'vendor_bill' ||
    al.category === 'purchase'
  ) {
    return 'vendor_bill';
  }

  // UoM inspection
  const uomName = (
    Array.isArray(al.product_uom_id) ? al.product_uom_id[1] : (typeof al.product_uom_id === 'string' ? al.product_uom_id : '')
  ).toLowerCase().trim();

  const isExplicitHourUom = Boolean(uomName && (
    uomName.includes('heur') ||
    uomName.includes('hour') ||
    uomName === 'h' ||
    uomName === 'hr' ||
    uomName === 'hrs'
  ));

  const isExplicitPhysicalUom = Boolean(uomName && !isExplicitHourUom && (
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
  ));

  if (isExplicitPhysicalUom) {
    return 'vendor_bill';
  }

  const hasEmployee = Boolean(
    al.employee_id && al.employee_id !== false && (Array.isArray(al.employee_id) ? al.employee_id[0] : al.employee_id)
  );

  const unitAmt = Number(al.unit_amount) || 0;

  // BRANCHE 1 : FEUILLES DE TEMPS (HEURES)
  if (
    al.category === 'timesheet' ||
    (Math.abs(unitAmt) > 0 && isExplicitHourUom) ||
    (hasEmployee && Math.abs(unitAmt) > 0) ||
    (hasEmployee && !uomName)
  ) {
    return 'timesheet';
  }

  // BRANCHE 3 : PRAGMAS / RÉGULATIONS DIRECTES (RÉSIDUEL)
  return 'pragma';
}

export class OdooBackendService {
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

  // Helper to cleanly extract string message from any error object (XML-RPC fault, JSON-RPC, Error, Fetch)
  public extractErrorMessage(err: any): string {
    if (!err) return 'Erreur inconnue';
    if (typeof err === 'string') return err;
    if (err.faultString && typeof err.faultString === 'string') return err.faultString;
    if (err.message && typeof err.message === 'string') return err.message;
    if (err.data?.message && typeof err.data.message === 'string') return err.data.message;
    if (err.data?.name && typeof err.data.name === 'string') return err.data.name;
    if (err.error?.message && typeof err.error.message === 'string') return err.error.message;
    if (err.error?.data?.message && typeof err.error.data.message === 'string') return err.error.data.message;
    if (err.statusText) return `Erreur HTTP ${err.status || ''}: ${err.statusText}`;
    try {
      const jsonStr = JSON.stringify(err);
      return jsonStr !== '{}' ? jsonStr : String(err);
    } catch {
      return String(err);
    }
  }

  // Format any raw Odoo error into a clean, human-readable message
  public formatOdooError(err: any, creds: OdooConnectionCredentials): Error {
    const rawMsg = this.extractErrorMessage(err);

    if (rawMsg.includes('Unknown XML-RPC tag') || rawMsg.includes('TITLE') || rawMsg.includes('HTML') || rawMsg.includes('<!DOCTYPE')) {
      return new Error(
        `Le serveur Odoo à "${creds.url}" a renvoyé une page HTML au lieu d'une réponse API. Vérifiez que l'URL est bien l'adresse racine (ex: https://votre-instance.odoo.com) et que le protocole https:// est correct.`
      );
    }

    if (rawMsg.includes('Invalid field')) {
      const match = rawMsg.match(/Invalid field ['"]?([^'"]+)['"]?/i);
      const fieldName = match ? match[1] : 'inconnu';
      return new Error(`Le champ technique '${fieldName}' n'existe pas sur ce modèle Odoo pour votre version.`);
    }

    if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('fetch failed')) {
      return new Error(`Impossible d'accéder au serveur Odoo à "${creds.url}". Vérifiez l'adresse de votre instance et votre réseau.`);
    }

    if (rawMsg.includes('AccessDenied') || rawMsg.includes('Access Denied') || rawMsg.includes('cannot be authenticated') || rawMsg.includes('wrong password') || rawMsg.includes('Wrong login')) {
      return new Error(`Authentification Odoo refusée : vérifiez le nom de la base '${creds.db}', l'identifiant '${creds.username}' et la clé d'API.`);
    }

    if (rawMsg.includes('does not exist') || (rawMsg.includes('database') && rawMsg.includes('not found'))) {
      return new Error(`La base de données Odoo "${creds.db}" n'existe pas ou n'est pas accessible sur cette instance.`);
    }

    return new Error(rawMsg);
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
      console.warn(`XML-RPC execution failed for ${model}.${method}, attempting JSON-RPC fallback...`, this.extractErrorMessage(xmlErr));
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
        console.error('JSON-RPC fallback execution also failed:', jsonErr);
        throw this.formatOdooError(jsonErr, creds);
      }
    }
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
    let xmlRpcErr: any = null;
    try {
      const commonClient = this.createXmlRpcClient(cleanUrl, '/xmlrpc/2/common');
      
      let versionInfo: any = {};
      try {
        versionInfo = await this.xmlRpcMethodCall(commonClient, 'version', []);
      } catch (verErr) {
        console.warn('Odoo version check XML-RPC notice:', verErr);
      }

      const uid = await this.xmlRpcMethodCall(commonClient, 'authenticate', [
        creds.db,
        creds.username,
        creds.apiKey,
        {}
      ]);

      const latencyMs = Date.now() - startTime;

      if (typeof uid === 'number' && uid > 0) {
        return {
          success: true,
          uid,
          serverVersion: versionInfo?.server_version || 'Odoo Enterprise / Community',
          serverVersionInfo: versionInfo?.server_version_info || [],
          latencyMs
        };
      } else {
        xmlRpcErr = new Error('Identifiants invalides : Odoo a rejeté l\'email, le nom de base de données ou la clé d\'API.');
      }
    } catch (err: any) {
      xmlRpcErr = err;
    }

    // 2. Automatic JSON-RPC Fallback (works across all standard Odoo setups including HTTPS reverse proxies)
    console.log('Attempting JSON-RPC authentication fallback for Odoo...');
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

      if (typeof uid === 'number' && uid > 0) {
        return {
          success: true,
          uid,
          serverVersion: versionInfo?.server_version || 'Odoo Enterprise / Community (JSON-RPC)',
          serverVersionInfo: versionInfo?.server_version_info || [],
          latencyMs
        };
      } else {
        return {
          success: false,
          latencyMs,
          error: 'Authentification Odoo refusée : vérifiez la base de données, l\'email utilisateur et la clé d\'API.'
        };
      }
    } catch (jsonErr: any) {
      const latencyMs = Date.now() - startTime;
      const finalError = this.formatOdooError(jsonErr || xmlRpcErr, creds);
      return {
        success: false,
        latencyMs,
        error: finalError.message
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

    const safeSaleFields = existingSaleFields.size > 0
      ? candidateSaleFields.filter(f => existingSaleFields.has(f) || f === 'id')
      : ['id', 'name', 'partner_id', 'user_id', 'amount_untaxed', 'amount_total', 'date_order', 'state', 'invoice_status'];

    // 3. Step 1: Query Confirmed Uninvoiced Sale Orders
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

    const orderIds = saleOrders.map(so => so.id);
    const orderToAnalyticIds = new Map<number, Set<number>>();
    const allAnalyticAccountIds = new Set<number>();
    const projectToOrderIds = new Map<number, number>();
    const projectIds: number[] = [];

    saleOrders.forEach(so => {
      if (!orderToAnalyticIds.has(so.id)) {
        orderToAnalyticIds.set(so.id, new Set<number>());
      }
      const orderSet = orderToAnalyticIds.get(so.id)!;

      if (so.analytic_account_id && Array.isArray(so.analytic_account_id) && typeof so.analytic_account_id[0] === 'number') {
        orderSet.add(so.analytic_account_id[0]);
        allAnalyticAccountIds.add(so.analytic_account_id[0]);
      }
      if (so.analytic_distribution && typeof so.analytic_distribution === 'object') {
        Object.keys(so.analytic_distribution).forEach(k => {
          const numId = parseInt(k, 10);
          if (!isNaN(numId)) {
            orderSet.add(numId);
            allAnalyticAccountIds.add(numId);
          }
        });
      }
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
    let allAnalyticLines: any[] = [];
    try {
      const aalFieldDefs = await this.getModelFields(creds, uid, 'account.analytic.line');
      const aalFieldsSet = new Set(Object.keys(aalFieldDefs));
      
      const candidateAalFields = [
        'id', 'name', 'unit_amount', 'date', 'user_id', 'employee_id', 
        'account_id', 'so_line', 'project_id', 'task_id', 'amount', 'move_line_id', 
        'purchase_line_id', 'category', 'product_uom_id', 'partner_id', 'ref', 'product_id', 'general_account_id'
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

        if (Array.isArray(allAnalyticLines)) {
          allAnalyticLines.forEach((al: any) => {
            if (al.account_id && Array.isArray(al.account_id) && typeof al.account_id[0] === 'number') {
              const accId = al.account_id[0];
              allAnalyticAccountIds.add(accId);
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

      // STRICT 3-BRANCH EXCLUSIVE DISPATCHING OF account.analytic.line:
      // 1. Branche 1: Timesheets (Heures prestées) -> Total Heures Prestées (non inclus dans Pragma)
      // 2. Branche 2: Factures Fournisseurs & Achats Matériel (MOU500, move_line_id, purchase_line_id, etc.) -> Factures Fournisseurs (non inclus dans Pragma)
      // 3. Branche 3: Pragmas / Régulations Directes (Résiduel sans pièce d'achat et sans heures) -> Écritures Analytiques Directes / Pragma
      const branch1Timesheets: any[] = [];
      const branch2PurchasesFromAal: any[] = [];
      const branch3Pragmas: any[] = [];

      for (const al of matchingAnalyticLines) {
        const branch = classifyAnalyticLine(al);
        if (branch === 'timesheet') {
          branch1Timesheets.push(al);
        } else if (branch === 'vendor_bill') {
          branch2PurchasesFromAal.push(al);
        } else {
          // Branche 3: Pragma / Régulations directes résiduelles
          const rawAmt = Number(al.amount) || 0;
          const unitAmt = Number(al.unit_amount) || 0;
          if (rawAmt !== 0 || unitAmt !== 0) {
            branch3Pragmas.push(al);
          }
        }
      }

      // 1. BRANCHE 1 : FEUILLES DE TEMPS (HEURES)
      // Odoo stocke les coûts/prestations d'heures avec un montant financier 'amount' NÉGATIF pour les charges (ex: -182,68 € pour 2,5 hrs).
      // - Si 'amount' <= 0 (Charge / Heures prestées sur le projet) : unit_amount comptabilisée en POSITIF (+).
      // - Si 'amount' > 0 (Régulation / Transfert d'heures hors du projet) : unit_amount comptabilisée en NÉGATIF (-) pour se déduire du total du projet.
      const orderTimesheets = branch1Timesheets.map(al => {
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

      // 2. BRANCHE 2 : FACTURES FOURNISSEURS & ACHATS MATÉRIEL
      // Regroupe les factures d'achat comptabilisées (account.move.line proratisées) et les écritures analytiques de factures/commandes/MOU500
      const seenBillMoveLineIds = new Set<number>();
      const orderPurchases: any[] = [];

      for (const pl of (Array.isArray(purchaseLines) ? purchaseLines : [])) {
        if (asOfDate && pl.date && String(pl.date).slice(0, 10) > asOfDate) {
          continue;
        }

        // Parse analytic_distribution (JSON object ou string)
        let dist: Record<string, number> = {};
        if (typeof pl.analytic_distribution === 'string') {
          try {
            dist = JSON.parse(pl.analytic_distribution);
          } catch {
            dist = {};
          }
        } else if (pl.analytic_distribution && typeof pl.analytic_distribution === 'object') {
          dist = pl.analytic_distribution;
        }

        let matchedPercentage = 0;
        const distKeys = Object.keys(dist);

        if (distKeys.length > 0) {
          for (const k of distKeys) {
            const numK = parseInt(k, 10);
            if (!isNaN(numK) && orderAnalyticSet.has(numK)) {
              matchedPercentage += (Number(dist[k]) || 0);
            }
          }
        } else if (pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && orderAnalyticSet.has(pl.analytic_account_id[0])) {
          matchedPercentage = 100;
        }

        if (matchedPercentage > 0) {
          const rawSubtotal = (pl.price_subtotal !== undefined && pl.price_subtotal !== null && Number(pl.price_subtotal) !== 0)
            ? Number(pl.price_subtotal)
            : (Number(pl.debit) || 0);

          const allocatedSubtotal = Math.round(rawSubtotal * (matchedPercentage / 100) * 100) / 100;

          if (pl.id) {
            seenBillMoveLineIds.add(pl.id);
          }

          orderPurchases.push({
            id: pl.id,
            name: pl.name || 'Achat fournisseur',
            ref: pl.ref || (Array.isArray(pl.move_id) ? pl.move_id[1] : ''),
            move_id: pl.move_id || false,
            purchase_line_id: pl.purchase_line_id || false,
            partner_id: pl.partner_id || false,
            price_subtotal: allocatedSubtotal,
            original_price_subtotal: rawSubtotal,
            prorata_percentage: matchedPercentage,
            analytic_distribution: distKeys.length > 0 ? dist : undefined,
            debit: pl.debit,
            credit: pl.credit,
            date: pl.date || '',
            parent_state: pl.parent_state || 'posted',
            analytic_account_id: pl.analytic_account_id || false
          });
        }
      }

      // Traitement des lignes de la Branche 2 issues de account.analytic.line (factures, bons d'achat, MOU500)
      for (const al of branch2PurchasesFromAal) {
        const moveLineId = al.move_line_id ? (Array.isArray(al.move_line_id) ? al.move_line_id[0] : Number(al.move_line_id)) : null;
        if (moveLineId && seenBillMoveLineIds.has(moveLineId)) {
          continue; // Déjà pris en compte depuis account.move.line
        }
        if (moveLineId) {
          seenBillMoveLineIds.add(moveLineId);
        }

        const costVal = Math.abs(Number(al.amount) || 0);
        const accLabel = Array.isArray(al.account_id) ? String(al.account_id[1]) : '';
        const isMOU500 = accLabel.toUpperCase().includes('MOU500');
        const isPO = Boolean(al.purchase_line_id && al.purchase_line_id !== false);

        orderPurchases.push({
          id: al.id ? `aal-${al.id}` : (moveLineId || Math.random()),
          name: al.name || (isMOU500 ? 'Achat matériel / MOU500' : (isPO ? 'Achat bon de commande fournisseur' : 'Achat fournisseur (analytique)')),
          ref: al.ref || (Array.isArray(al.move_line_id) ? al.move_line_id[1] : (Array.isArray(al.purchase_line_id) ? al.purchase_line_id[1] : '')),
          move_id: al.move_line_id || false,
          purchase_line_id: al.purchase_line_id || false,
          partner_id: al.partner_id || false,
          price_subtotal: costVal,
          original_price_subtotal: costVal,
          prorata_percentage: 100,
          date: al.date || '',
          parent_state: 'posted',
          analytic_account_id: al.account_id || false
        });
      }

      // Sum of prorated vendor bills and purchases
      const vendorBillsTotal = Math.round(orderPurchases.reduce((sum, pl) => sum + (Number(pl.price_subtotal) || 0), 0) * 100) / 100;

      // 3. BRANCHE 3 : PRAGMAS / RÉGULATIONS DIRECTES (RÉSIDUEL)
      // Ne garder que les régulations d'encours ou ajustements comptables manuels sans pièce fournisseur et sans heures
      const orderManualAnalyticLines = branch3Pragmas.map(al => {
        const rawAmount = Number(al.amount) || 0;
        const costAmount = Math.abs(rawAmount);

        return {
          id: al.id,
          name: al.name || 'Régulation Pragma / Écriture directe',
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
          category: 'pragma',
          move_line_id: false,
          purchase_line_id: false,
          partner_id: al.partner_id || false,
          ref: al.ref ? String(al.ref) : ''
        };
      });

      // Sum of direct manual analytic costs (Pragma / encours / régulations directes)
      const manualAnalyticCostsTotal = Math.round(orderManualAnalyticLines.reduce((sum, mal) => sum + mal.amount, 0) * 100) / 100;

      // Total purchases / direct costs: Factures Fournisseurs (prorata) + Écritures Analytiques Directes
      const totalPurchases = Math.round((vendorBillsTotal + manualAnalyticCostsTotal) * 100) / 100;

      const valuation77_76 = Math.round(totalHours * 77.76 * 100) / 100;
      const valuation90 = Math.round(totalHours * 90.00 * 100) / 100;

      const amountUntaxed = Number(so.amount_untaxed) || 0;
      const amountTotal = Number(so.amount_total) || 0;

      const grossMargin = Math.round((amountUntaxed - totalPurchases - valuation77_76) * 100) / 100;
      const marginRate = amountUntaxed > 0 ? Math.round(((grossMargin / amountUntaxed) * 100) * 10) / 10 : 0;
      const hourlyMarginRate = totalHours > 0 ? Math.round((grossMargin / totalHours) * 100) / 100 : 0;

      const partnerName = Array.isArray(so.partner_id) ? so.partner_id[1] : (so.partner_id || 'Client inconnu');
      const clientDisplay = `${so.name} - ${partnerName}`;

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

    reportRows.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }));

    const totalSalesUntaxed = reportRows.reduce((acc, row) => acc + row.amount_untaxed, 0);
    const totalTimesheetHours = reportRows.reduce((acc, row) => acc + row.totalHours, 0);
    const totalPurchasesInvoiced = reportRows.reduce((acc, row) => acc + row.totalPurchases, 0);
    const totalVendorBills = reportRows.reduce((acc, row) => acc + (row.vendorBillsTotal || 0), 0);
    const totalManualAnalyticCosts = reportRows.reduce((acc, row) => acc + (row.manualAnalyticCostsTotal || 0), 0);
    const totalValuation77_76 = Math.round(totalTimesheetHours * 77.76 * 100) / 100;
    const totalValuation90 = Math.round(totalTimesheetHours * 90.00 * 100) / 100;
    const totalGrossMargin = Math.round((totalSalesUntaxed - totalPurchasesInvoiced - totalValuation77_76) * 100) / 100;
    const averageMarginRate = totalSalesUntaxed > 0 ? Math.round(((totalGrossMargin / totalSalesUntaxed) * 100) * 10) / 10 : 0;

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

      const branch1Timesheets: any[] = [];
      const branch2PurchasesFromAal: any[] = [];
      const branch3Pragmas: any[] = [];

      for (const al of matchingAnalytic) {
        const branch = classifyAnalyticLine(al);
        if (branch === 'timesheet') {
          branch1Timesheets.push(al);
        } else if (branch === 'vendor_bill') {
          branch2PurchasesFromAal.push(al);
        } else {
          const rawAmt = Number(al.amount) || 0;
          const unitAmt = Number(al.unit_amount) || 0;
          if (rawAmt !== 0 || unitAmt !== 0) {
            branch3Pragmas.push(al);
          }
        }
      }

      // Timesheets:
      const orderTimesheets = branch1Timesheets.map(al => {
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

      // Manual analytic direct costs (Pragma)
      const orderManualAnalyticLines = branch3Pragmas.map(al => {
        const rawAmount = Number(al.amount) || 0;
        const costAmount = Math.abs(rawAmount);
        return {
          id: al.id,
          name: al.name || 'Écriture analytique directe / Pragma',
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
          category: 'pragma',
          move_line_id: false,
          partner_id: al.partner_id || false,
          ref: al.ref ? String(al.ref) : ''
        };
      });

      // Vendor bills
      const seenBillMoveLineIds = new Set<number>();
      const orderPurchases: any[] = [];

      for (const pl of purchaseLines) {
        if (analyticId && pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && pl.analytic_account_id[0] === analyticId) {
          if (pl.id) seenBillMoveLineIds.add(pl.id);
          orderPurchases.push(pl);
        }
      }

      for (const al of branch2PurchasesFromAal) {
        const moveLineId = al.move_line_id ? (Array.isArray(al.move_line_id) ? al.move_line_id[0] : Number(al.move_line_id)) : null;
        if (moveLineId && seenBillMoveLineIds.has(moveLineId)) continue;
        if (moveLineId) seenBillMoveLineIds.add(moveLineId);

        const costVal = Math.abs(Number(al.amount) || 0);
        orderPurchases.push({
          id: al.id ? `aal-${al.id}` : (moveLineId || Math.random()),
          name: al.name || 'Achat fournisseur (analytique)',
          ref: al.ref || (Array.isArray(al.move_line_id) ? al.move_line_id[1] : ''),
          move_id: al.move_line_id || false,
          partner_id: al.partner_id || false,
          price_subtotal: costVal,
          original_price_subtotal: costVal,
          prorata_percentage: 100,
          date: al.date || '',
          parent_state: 'posted',
          analytic_account_id: al.account_id || false
        });
      }

      const vendorBillsTotal = orderPurchases.reduce((sum, pl) => sum + (Number(pl.price_subtotal) || 0), 0);
      const manualAnalyticCostsTotal = orderManualAnalyticLines.reduce((sum, mal) => sum + mal.amount, 0);
      const totalPurchases = vendorBillsTotal + manualAnalyticCostsTotal;

      const valuation77_76 = Math.round(totalHours * 77.76 * 100) / 100;
      const valuation90 = Math.round(totalHours * 90.00 * 100) / 100;

      const amountUntaxed = Number(so.amount_untaxed) || 0;
      const amountTotal = Number(so.amount_total) || 0;

      const grossMargin = Math.round((amountUntaxed - totalPurchases - valuation77_76) * 100) / 100;
      const marginRate = amountUntaxed > 0 ? Math.round(((grossMargin / amountUntaxed) * 100) * 10) / 10 : 0;
      const hourlyMarginRate = totalHours > 0 ? Math.round((grossMargin / totalHours) * 100) / 100 : 0;

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

  // Specialized Report: Vérification du Poids des Articles (Moules Neufs)
  public async getMouldWeightCheckReport(
    creds: OdooConnectionCredentials,
    forceRefresh: boolean = false
  ): Promise<{
    records: MouldWeightCheckItem[];
    totalCount: number;
    summary: MouldWeightCheckSummary;
    fromCache: boolean;
    executionTimeMs: number;
  }> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey('report_mould_weight_check', {
      url: creds.url,
      db: creds.db,
      user: creds.username
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

    const authRes = await this.testConnection(creds);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || 'Échec de connexion au serveur Odoo.');
    }
    const uid = authRes.uid;
    const baseUrl = (creds.url || '').replace(/\/+$/, '');

    const saleFieldDefs = await this.getModelFields(creds, uid, 'sale.order');
    const existingSaleFields = new Set(Object.keys(saleFieldDefs));

    const candidateFields = [
      'id', 'name', 'partner_id', 'date_order', 'state', 'invoice_status', 'tag_ids', 'order_line', 'client_order_ref'
    ];
    const safeSaleFields = candidateFields.filter(f => existingSaleFields.has(f) || f === 'id' || f === 'name');

    const saleDomain: any[] = [['state', 'in', ['sale', 'done']]];
    if (existingSaleFields.has('invoice_status')) {
      saleDomain.push(['invoice_status', '!=', 'invoiced']);
    }

    let saleOrders: any[] = [];
    try {
      saleOrders = await this.executeKw(
        creds,
        uid,
        'sale.order',
        'search_read',
        [saleDomain],
        { fields: safeSaleFields, order: 'date_order desc', limit: 300 }
      );
    } catch (err: any) {
      saleOrders = await this.executeKw(
        creds,
        uid,
        'sale.order',
        'search_read',
        [[['state', 'in', ['sale', 'done']]]],
        { fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'order_line'], order: 'date_order desc', limit: 300 }
      );
    }

    if (!Array.isArray(saleOrders) || saleOrders.length === 0) {
      const emptyResult = {
        records: [],
        totalCount: 0,
        summary: { totalOrdersCount: 0, totalProductsCount: 0, anomaliesCount: 0, compliantCount: 0, complianceRate: 100 },
        fromCache: false,
        executionTimeMs: Date.now() - startTime
      };
      this.setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    const allTagIds: number[] = [];
    for (const so of saleOrders) {
      if (Array.isArray(so.tag_ids)) {
        for (const t of so.tag_ids) {
          if (typeof t === 'number') allTagIds.push(t);
          else if (Array.isArray(t) && typeof t[0] === 'number') allTagIds.push(t[0]);
        }
      }
    }

    const tagMap = new Map<number, string>();
    if (allTagIds.length > 0) {
      const uniqueTagIds = Array.from(new Set(allTagIds));
      try {
        const tagRecords = await this.executeKw(creds, uid, 'crm.tag', 'read', [uniqueTagIds], { fields: ['id', 'name'] });
        if (Array.isArray(tagRecords)) {
          for (const t of tagRecords) tagMap.set(t.id, t.name || '');
        }
      } catch (eTag) {
        try {
          const tagRecords = await this.executeKw(creds, uid, 'sale.order.tag', 'read', [uniqueTagIds], { fields: ['id', 'name'] });
          if (Array.isArray(tagRecords)) {
            for (const t of tagRecords) tagMap.set(t.id, t.name || '');
          }
        } catch (eTag2) {
          console.warn('Could not read tags:', eTag2);
        }
      }
    }

    const matchedOrders: any[] = [];
    const orderTagNamesMap = new Map<number, string[]>();

    for (const so of saleOrders) {
      const names: string[] = [];
      if (Array.isArray(so.tag_ids)) {
        for (const t of so.tag_ids) {
          if (typeof t === 'number') {
            const tagName = tagMap.get(t);
            if (tagName) names.push(tagName);
          } else if (Array.isArray(t) && typeof t[1] === 'string') {
            names.push(t[1]);
          } else if (typeof t === 'string') {
            names.push(t);
          }
        }
      }
      orderTagNamesMap.set(so.id, names);

      const hasMouldTag = names.some(n => {
        const clean = n.toLowerCase().trim();
        return clean.includes('moule neuf') || clean.includes('moules neufs');
      });
      if (hasMouldTag) matchedOrders.push(so);
    }

    if (matchedOrders.length === 0) {
      const emptyResult = {
        records: [],
        totalCount: 0,
        summary: { totalOrdersCount: 0, totalProductsCount: 0, anomaliesCount: 0, compliantCount: 0, complianceRate: 100 },
        fromCache: false,
        executionTimeMs: Date.now() - startTime
      };
      this.setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    const matchedOrderIds = matchedOrders.map(o => o.id);
    let orderLines: any[] = [];
    try {
      orderLines = await this.executeKw(
        creds,
        uid,
        'sale.order.line',
        'search_read',
        [[['order_id', 'in', matchedOrderIds], ['product_id', '!=', false]]],
        { fields: ['id', 'order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'], limit: 1000 }
      );
    } catch (eLines: any) {
      throw new Error(`Erreur lors de la lecture des lignes de commande : ${eLines.message}`);
    }

    const productIds = Array.from(new Set(
      orderLines
        .map(l => (Array.isArray(l.product_id) ? l.product_id[0] : l.product_id))
        .filter(id => Boolean(id) && typeof id === 'number')
    ));

    const productMap = new Map<number, any>();
    if (productIds.length > 0) {
      try {
        const products = await this.executeKw(
          creds,
          uid,
          'product.product',
          'read',
          [productIds],
          { fields: ['id', 'name', 'default_code', 'weight', 'product_tmpl_id', 'type'] }
        );
        if (Array.isArray(products)) {
          for (const p of products) productMap.set(p.id, p);
        }
      } catch (eProd: any) {
        const products = await this.executeKw(
          creds,
          uid,
          'product.product',
          'read',
          [productIds],
          { fields: ['id', 'name', 'default_code', 'product_tmpl_id'] }
        );
        if (Array.isArray(products)) {
          for (const p of products) productMap.set(p.id, p);
        }
      }
    }

    const orderMap = new Map<number, any>();
    for (const o of matchedOrders) orderMap.set(o.id, o);

    const records: MouldWeightCheckItem[] = [];
    for (const line of orderLines) {
      const orderId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
      const order = orderMap.get(orderId);
      if (!order) continue;

      const prodId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
      const prodNameFromLine = Array.isArray(line.product_id) ? line.product_id[1] : (line.name || 'Article');
      const product = productMap.get(prodId) || {};

      const productName = product.name || prodNameFromLine;
      const productDefaultCode = product.default_code || '';
      const productTmplId = Array.isArray(product.product_tmpl_id) ? product.product_tmpl_id[0] : product.product_tmpl_id;

      const rawWeight = product.weight;
      const weightNum = (rawWeight !== undefined && rawWeight !== null && !isNaN(Number(rawWeight)))
        ? Math.max(0, Number(rawWeight))
        : 0;

      const hasWeight = weightNum > 0;
      const status: MouldWeightStatus = hasWeight ? 'CONFORME' : 'ANOMALIE';
      const formattedWeight = weightNum % 1 === 0 ? weightNum.toString() : weightNum.toFixed(2).replace(/\.?0+$/, '');
      const statusLabel = hasWeight 
        ? `Poids renseigné (${formattedWeight} kg)`
        : 'Poids manquant (0 kg)';

      const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : (order.partner_id || 'Client inconnu');
      const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : 0;
      const tagNames = orderTagNamesMap.get(order.id) || ['Moule neuf'];

      const odooProductUrl = prodId ? `${baseUrl}/web#id=${prodId}&model=product.product&view_type=form` : undefined;
      const odooOrderUrl = order.id ? `${baseUrl}/web#id=${order.id}&model=sale.order&view_type=form` : undefined;

      records.push({
        id: `${order.id}_${line.id}_${prodId || 0}`,
        orderId: order.id,
        orderName: order.name || `SO-${order.id}`,
        clientOrderRef: order.client_order_ref || '',
        orderDate: order.date_order || '',
        partnerId,
        partnerName,
        lineId: line.id,
        lineName: line.name || '',
        productId: prodId,
        productName,
        productDefaultCode,
        productTmplId,
        tagNames,
        tagDisplay: tagNames.join(', ') || 'Moule neuf',
        weight: weightNum,
        hasWeight,
        status,
        statusLabel,
        odooProductUrl,
        odooOrderUrl
      });
    }

    const uniqueOrders = new Set(records.map(r => r.orderId));
    const anomaliesCount = records.filter(r => r.status === 'ANOMALIE').length;
    const compliantCount = records.filter(r => r.status === 'CONFORME').length;
    const totalProductsCount = records.length;
    const complianceRate = totalProductsCount > 0 ? Math.round((compliantCount / totalProductsCount) * 100) : 100;

    const summary: MouldWeightCheckSummary = {
      totalOrdersCount: uniqueOrders.size,
      totalProductsCount,
      anomaliesCount,
      compliantCount,
      complianceRate
    };

    const finalResult = {
      records,
      totalCount: records.length,
      summary,
      fromCache: false,
      executionTimeMs: Date.now() - startTime
    };

    this.setCache(cacheKey, finalResult);
    return finalResult;
  }

  // Mock data for Demo / Sandbox exploration
  public getMockMouldWeightCheckReport(): {
    records: MouldWeightCheckItem[];
    totalCount: number;
    summary: MouldWeightCheckSummary;
    fromCache: boolean;
    executionTimeMs: number;
  } {
    const mockItems: MouldWeightCheckItem[] = [
      {
        id: '101_1011_501',
        orderId: 101,
        orderName: 'SO/2026/00142',
        clientOrderRef: 'PO-DECO-998',
        orderDate: '2026-08-22 14:32:00',
        partnerId: 12,
        partnerName: 'Deco Addict SAS (Lyon)',
        lineId: 1011,
        lineName: 'Moule 16 Empreintes Bouchon Flacon 28mm PCO1881',
        productId: 501,
        productName: 'Moule 16 Empreintes Bouchon Flacon 28mm PCO1881',
        productDefaultCode: 'MOULE-BF-28',
        productTmplId: 401,
        tagNames: ['Moule neuf'],
        tagDisplay: 'Moule neuf',
        weight: 0,
        hasWeight: false,
        status: 'ANOMALIE',
        statusLabel: 'Poids manquant (0 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=501&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=101&model=sale.order&view_type=form'
      },
      {
        id: '101_1012_502',
        orderId: 101,
        orderName: 'SO/2026/00142',
        clientOrderRef: 'PO-DECO-998',
        orderDate: '2026-08-22 14:32:00',
        partnerId: 12,
        partnerName: 'Deco Addict SAS (Lyon)',
        lineId: 1012,
        lineName: 'Empreintes Interchangeables Acier 1.2343 ESR Traité',
        productId: 502,
        productName: 'Empreintes Interchangeables Acier 1.2343 ESR Traité',
        productDefaultCode: 'EMP-ACIER-43',
        productTmplId: 402,
        tagNames: ['Moule neuf'],
        tagDisplay: 'Moule neuf',
        weight: 38.5,
        hasWeight: true,
        status: 'CONFORME',
        statusLabel: 'Poids renseigné (38.5 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=502&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=101&model=sale.order&view_type=form'
      },
      {
        id: '108_1081_505',
        orderId: 108,
        orderName: 'SO/2026/00135',
        clientOrderRef: 'ECO-26-44',
        orderDate: '2026-08-14 13:00:00',
        partnerId: 22,
        partnerName: 'EcoBat Construction Durable (Toulouse)',
        lineId: 1081,
        lineName: 'Moule Compression 2 Cavités Bac Batterie 12V Composite',
        productId: 505,
        productName: 'Moule Compression 2 Cavités Bac Batterie 12V Composite',
        productDefaultCode: 'MOULE-COMP-BAC',
        productTmplId: 405,
        tagNames: ['Moule neuf', 'Outillage Haute Précision'],
        tagDisplay: 'Moule neuf, Outillage Haute Précision',
        weight: 1850,
        hasWeight: true,
        status: 'CONFORME',
        statusLabel: 'Poids renseigné (1850 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=505&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=108&model=sale.order&view_type=form'
      },
      {
        id: '111_1111_508',
        orderId: 111,
        orderName: 'SO/2026/00134',
        clientOrderRef: 'NOVA-IT-402',
        orderDate: '2026-08-12 09:40:00',
        partnerId: 88,
        partnerName: 'Novatech Industrie (Lille)',
        lineId: 1111,
        lineName: 'Moule Injection Flacon Cosmétique 200ml Bi-Matière',
        productId: 508,
        productName: 'Moule Injection Flacon Cosmétique 200ml Bi-Matière',
        productDefaultCode: 'MOULE-FLAC-200',
        productTmplId: 408,
        tagNames: ['Moule neuf'],
        tagDisplay: 'Moule neuf',
        weight: 0,
        hasWeight: false,
        status: 'ANOMALIE',
        statusLabel: 'Poids manquant (0 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=508&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=111&model=sale.order&view_type=form'
      },
      {
        id: '111_1112_509',
        orderId: 111,
        orderName: 'SO/2026/00134',
        clientOrderRef: 'NOVA-IT-402',
        orderDate: '2026-08-12 09:40:00',
        partnerId: 88,
        partnerName: 'Novatech Industrie (Lille)',
        lineId: 1112,
        lineName: 'Buse Injection Canal Chaud Régulée 4 Zones',
        productId: 509,
        productName: 'Buse Injection Canal Chaud Régulée 4 Zones',
        productDefaultCode: 'INJ-BUS-04',
        productTmplId: 409,
        tagNames: ['Moule neuf'],
        tagDisplay: 'Moule neuf',
        weight: 14.2,
        hasWeight: true,
        status: 'CONFORME',
        statusLabel: 'Poids renseigné (14.2 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=509&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=111&model=sale.order&view_type=form'
      },
      {
        id: '112_1121_510',
        orderId: 112,
        orderName: 'SO/2026/00133',
        clientOrderRef: 'MED-2026-55',
        orderDate: '2026-08-10 14:15:00',
        partnerId: 72,
        partnerName: 'MedTech Santé Solutions (Rennes)',
        lineId: 1121,
        lineName: 'Moule Médical 8 Empreintes Corps de Seringue Luer-Lock',
        productId: 510,
        productName: 'Moule Médical 8 Empreintes Corps de Seringue Luer-Lock',
        productDefaultCode: 'MOULE-MED-08',
        productTmplId: 410,
        tagNames: ['Moule neuf', 'Salle Blanche ISO 7'],
        tagDisplay: 'Moule neuf, Salle Blanche ISO 7',
        weight: 0,
        hasWeight: false,
        status: 'ANOMALIE',
        statusLabel: 'Poids manquant (0 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=510&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=112&model=sale.order&view_type=form'
      },
      {
        id: '113_1131_512',
        orderId: 113,
        orderName: 'SO/2026/00132',
        clientOrderRef: 'LSD-LOG-90',
        orderDate: '2026-08-08 16:30:00',
        partnerId: 56,
        partnerName: 'Logis Sud Distribution (Marseille)',
        lineId: 1131,
        lineName: 'Moule Prototype 1 Empreinte Conduit Aération PEHD',
        productId: 512,
        productName: 'Moule Prototype 1 Empreinte Conduit Aération PEHD',
        productDefaultCode: 'MOULE-AERO-01',
        productTmplId: 412,
        tagNames: ['Moule neuf'],
        tagDisplay: 'Moule neuf',
        weight: 640,
        hasWeight: true,
        status: 'CONFORME',
        statusLabel: 'Poids renseigné (640 kg)',
        odooProductUrl: 'https://demo.odoo.com/web#id=512&model=product.product&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=113&model=sale.order&view_type=form'
      }
    ];

    const uniqueOrders = new Set(mockItems.map(r => r.orderId));
    const anomaliesCount = mockItems.filter(r => r.status === 'ANOMALIE').length;
    const compliantCount = mockItems.filter(r => r.status === 'CONFORME').length;
    const totalProductsCount = mockItems.length;
    const complianceRate = Math.round((compliantCount / totalProductsCount) * 100);

    return {
      records: mockItems,
      totalCount: mockItems.length,
      summary: {
        totalOrdersCount: uniqueOrders.size,
        totalProductsCount,
        anomaliesCount,
        compliantCount,
        complianceRate
      },
      fromCache: false,
      executionTimeMs: 14
    };
  }
}

export const odooBackendService = new OdooBackendService();
