import xmlrpc from 'xmlrpc';
import { 
  OdooConnectionCredentials, 
  OdooFieldDefinition,
  MouldWeightCheckItem,
  MouldWeightCheckSummary,
  MonthlyBillingSummaryItem,
  InvoicedDossierItem,
  BillingReportSummary,
  BillingReportResponse,
  WipPurchaseDetailItem,
  WipOutflowInvoiceItem,
  WipOutflowAvailableMonth,
  WipOutflowReportSummary,
  WipOutflowReportResponse,
  WipPurchasesInflowOrderItem,
  WipPurchasesInflowSummary,
  WipPurchasesInflowReportResponse
} from '../types/odoo';
import { MOCK_DATA } from '../data/mockOdooData';
import { MODEL_FIELD_DEFINITIONS } from '../data/odooModels';

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
/**
 * Règle métier stricte :
 * Dans la liste des pièces d'achats (Réf. Pièce), il ne peut JAMAIS y avoir de références
 * qui commencent par FV (Factures de vente clients) ni tout ce qui est ODMEN (Opérations Diverses Mensuelles).
 */
export function isExcludedPurchaseReference(refStr: string | undefined | null): boolean {
  if (!refStr) return false;
  const clean = String(refStr).trim().toUpperCase();
  // Exclut tout ce qui commence par FV (factures de vente) ou ODMEN (opérations diverses mensuelles)
  if (clean.startsWith('FV') || clean.startsWith('ODMEN')) {
    return true;
  }
  // Exclut également les formats avec délimiteurs (ex: FV/..., FV-..., ODMEN/..., ODMEN-...)
  if (/^(FV|ODMEN)[\/\-_ \d]/i.test(clean)) {
    return true;
  }
  return false;
}

export type AnalyticBranch = 'timesheet' | 'vendor_bill' | 'pragma';

export function classifyAnalyticLine(al: any): AnalyticBranch {
  // Exclure formellement toute ligne provenant d'une facture de vente (FV) ou d'une opération diverse mensuelle (ODMEN)
  const alRef = String(al.ref || '').trim();
  const alName = String(al.name || '').trim();
  const alMoveName = (Array.isArray(al.move_id) ? String(al.move_id[1] || '') : (Array.isArray(al.move_line_id) ? String(al.move_line_id[1] || '') : '')).trim();

  if (
    isExcludedPurchaseReference(alRef) ||
    isExcludedPurchaseReference(alName) ||
    isExcludedPurchaseReference(alMoveName)
  ) {
    return 'pragma';
  }

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

/**
 * Helper to parse composite analytic_distribution keys across all Odoo 16+ formats (e.g. "325,257", "257,415", "325")
 */
export function parseDistributionKeys(dist: any): { accountIds: number[]; percentage: number; rawKey: string }[] {
  if (!dist || typeof dist !== 'object') return [];
  const result: { accountIds: number[]; percentage: number; rawKey: string }[] = [];
  for (const [k, val] of Object.entries(dist)) {
    const percentage = Number(val) || 0;
    const ids = k.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    result.push({ accountIds: ids, percentage, rawKey: k });
  }
  return result;
}

class OdooBackendService {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlMs = 3 * 60 * 1000; // 3 minutes
  private preferJsonRpcHosts = new Set<string>();

  public markPreferJsonRpc(url: string): void {
    const clean = this.sanitizeUrl(url);
    if (clean) this.preferJsonRpcHosts.add(clean);
  }

  public prefersJsonRpc(url: string): boolean {
    const clean = this.sanitizeUrl(url);
    return clean ? this.preferJsonRpcHosts.has(clean) : false;
  }

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

    if (rawMsg.includes('does not exist') || rawMsg.includes('database') && rawMsg.includes('not found')) {
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
    
    // If instance is already marked as preferring JSON-RPC (e.g. reverse proxy returning HTML for XML-RPC), route directly
    if (this.prefersJsonRpc(cleanUrl)) {
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
        throw this.formatOdooError(jsonErr, creds);
      }
    }

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
      const xmlErrMsg = this.extractErrorMessage(xmlErr);
      const isHtmlTagError = xmlErrMsg.includes('Unknown XML-RPC tag') || 
                             xmlErrMsg.includes('TITLE') || 
                             xmlErrMsg.includes('HTML') || 
                             xmlErrMsg.includes('<!DOCTYPE');

      if (isHtmlTagError) {
        // Tag/HTML response indicates a reverse proxy or endpoint not accepting XML-RPC
        this.markPreferJsonRpc(cleanUrl);
      }

      try {
        const result = await this.jsonRpcCall(cleanUrl, 'object', 'execute_kw', [
          creds.db,
          uid,
          creds.apiKey,
          model,
          method,
          args,
          kwargs
        ]);
        // When JSON-RPC succeeds, stick to it for all future calls to eliminate overhead
        this.markPreferJsonRpc(cleanUrl);
        return result;
      } catch (jsonErr: any) {
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

    // If this host is known to use JSON-RPC, skip XML-RPC directly
    if (this.prefersJsonRpc(cleanUrl)) {
      return await this.testConnectionJsonRpc(creds, cleanUrl, startTime);
    }

    // 1. Try XML-RPC authentication
    let xmlRpcErr: any = null;
    let xmlTagHtmlDetected = false;
    try {
      const commonClient = this.createXmlRpcClient(cleanUrl, '/xmlrpc/2/common');
      
      let versionInfo: any = {};
      try {
        versionInfo = await this.xmlRpcMethodCall(commonClient, 'version', []);
      } catch (verErr: any) {
        const errMsg = this.extractErrorMessage(verErr);
        if (errMsg.includes('Unknown XML-RPC tag') || errMsg.includes('TITLE') || errMsg.includes('HTML') || errMsg.includes('<!DOCTYPE')) {
          xmlTagHtmlDetected = true;
          this.markPreferJsonRpc(cleanUrl);
        }
      }

      if (!xmlTagHtmlDetected) {
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
      }
    } catch (err: any) {
      xmlRpcErr = err;
      const errMsg = this.extractErrorMessage(err);
      if (errMsg.includes('Unknown XML-RPC tag') || errMsg.includes('TITLE') || errMsg.includes('HTML') || errMsg.includes('<!DOCTYPE')) {
        this.markPreferJsonRpc(cleanUrl);
      }
    }

    // 2. Automatic JSON-RPC Fallback
    return await this.testConnectionJsonRpc(creds, cleanUrl, startTime, xmlRpcErr);
  }

  // Dedicated JSON-RPC Authentication helper
  private async testConnectionJsonRpc(
    creds: OdooConnectionCredentials,
    cleanUrl: string,
    startTime: number,
    previousXmlErr: any = null
  ): Promise<{
    success: boolean;
    uid?: number;
    serverVersion?: string;
    serverVersionInfo?: any[];
    latencyMs?: number;
    error?: string;
  }> {
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
        this.markPreferJsonRpc(cleanUrl);
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
      const finalError = this.formatOdooError(jsonErr || previousXmlErr, creds);
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
    } catch {
      // Model not accessible or lacks permissions, use standard schema fallback safely
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
      'project_account_id',     // Odoo 18+, 19+
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

    // 2.5 Query analytic accounts to identify secondary cost category plans (e.g. Plan 'Analytique' with MOU500, TRP000)
    // These accounts represent cost categories, NOT the project/affaire itself.
    // They must NEVER be treated as an order's own project analytic account.
    const secondaryPlanAccountIds = new Set<number>();
    try {
      const aalAccs = await this.executeKw(
        creds,
        uid,
        'account.analytic.account',
        'search_read',
        [[]],
        { fields: ['id', 'name', 'code', 'plan_id'], limit: 3000 }
      );
      if (Array.isArray(aalAccs)) {
        aalAccs.forEach((a: any) => {
          const planName = a.plan_id ? String(a.plan_id[1]).toLowerCase() : '';
          // Any plan that is explicitly not the project plan (e.g. 'analytique', 'nature', 'centre de coût')
          // Or if plan_id[0] is not 1 (Plan 1 is Project)
          if (planName.includes('analytique') || (a.plan_id && a.plan_id[0] !== 1 && !planName.includes('project') && !planName.includes('projet'))) {
            secondaryPlanAccountIds.add(a.id);
          }
        });
      }
    } catch (ePlan) {
      console.warn('Failed to introspect account.analytic.account plans (non-fatal):', ePlan);
    }

    // Helper to parse composite analytic_distribution keys across all Odoo 16+ formats (e.g. "325,257", "257,415", "325")
    const parseDistributionKeys = (dist: any): { accountIds: number[]; percentage: number; rawKey: string }[] => {
      if (!dist || typeof dist !== 'object') return [];
      const result: { accountIds: number[]; percentage: number; rawKey: string }[] = [];
      for (const [k, val] of Object.entries(dist)) {
        const percentage = Number(val) || 0;
        const ids = k.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        result.push({ accountIds: ids, percentage, rawKey: k });
      }
      return result;
    };

    // Extract Order IDs, Names, Project IDs, and Analytic Account IDs across versions
    const orderIds = saleOrders.map(so => so.id);
    const orderNames = saleOrders.map(so => so.name).filter(Boolean);
    
    // Map to track analytic account IDs per sale.order ID
    const orderToAnalyticIds = new Map<number, Set<number>>();
    const allAnalyticAccountIds = new Set<number>();
    const projectToOrderIds = new Map<number, Set<number>>();
    const projectIds: number[] = [];

    saleOrders.forEach(so => {
      if (!orderToAnalyticIds.has(so.id)) {
        orderToAnalyticIds.set(so.id, new Set<number>());
      }
      const orderSet = orderToAnalyticIds.get(so.id)!;

      // 1. Direct project_account_id on sale.order (Odoo 18+, 19+)
      if (so.project_account_id && Array.isArray(so.project_account_id) && typeof so.project_account_id[0] === 'number') {
        const pAccId = so.project_account_id[0];
        if (!secondaryPlanAccountIds.has(pAccId)) {
          orderSet.add(pAccId);
          allAnalyticAccountIds.add(pAccId);
        }
      }
      // 2. Direct analytic_account_id on sale.order (Odoo <= 15)
      if (so.analytic_account_id && Array.isArray(so.analytic_account_id) && typeof so.analytic_account_id[0] === 'number') {
        const aAccId = so.analytic_account_id[0];
        if (!secondaryPlanAccountIds.has(aAccId)) {
          orderSet.add(aAccId);
          allAnalyticAccountIds.add(aAccId);
        }
      }
      // 3. Odoo 16+ analytic_distribution on sale.order (dict like {"42": 100.0} or {"325,257": 100.0})
      if (so.analytic_distribution && typeof so.analytic_distribution === 'object') {
        parseDistributionKeys(so.analytic_distribution).forEach(entry => {
          entry.accountIds.forEach(numId => {
            if (!secondaryPlanAccountIds.has(numId)) {
              orderSet.add(numId);
              allAnalyticAccountIds.add(numId);
            }
          });
        });
      }
      // 4. project_id if present
      if (so.project_id && Array.isArray(so.project_id) && typeof so.project_id[0] === 'number') {
        const pId = so.project_id[0];
        projectIds.push(pId);
        if (!projectToOrderIds.has(pId)) {
          projectToOrderIds.set(pId, new Set<number>());
        }
        projectToOrderIds.get(pId)!.add(so.id);
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
            const linkedOrders = projectToOrderIds.get(proj.id);
            if (linkedOrders && linkedOrders.size > 0) {
              const accCandidates: number[] = [];
              if (proj.analytic_account_id && Array.isArray(proj.analytic_account_id) && typeof proj.analytic_account_id[0] === 'number') {
                accCandidates.push(proj.analytic_account_id[0]);
              }
              if (proj.account_id && Array.isArray(proj.account_id) && typeof proj.account_id[0] === 'number') {
                accCandidates.push(proj.account_id[0]);
              }
              accCandidates.forEach(accId => {
                if (!secondaryPlanAccountIds.has(accId)) {
                  allAnalyticAccountIds.add(accId);
                  for (const ordId of linkedOrders) {
                    if (orderToAnalyticIds.has(ordId)) {
                      orderToAnalyticIds.get(ordId)!.add(accId);
                    }
                  }
                }
              });
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
                const accId = line.analytic_account_id[0];
                if (!secondaryPlanAccountIds.has(accId)) {
                  orderSet.add(accId);
                  allAnalyticAccountIds.add(accId);
                }
              }
              if (line.analytic_distribution && typeof line.analytic_distribution === 'object') {
                parseDistributionKeys(line.analytic_distribution).forEach(entry => {
                  entry.accountIds.forEach(numId => {
                    if (!secondaryPlanAccountIds.has(numId)) {
                      orderSet.add(numId);
                      allAnalyticAccountIds.add(numId);
                    }
                  });
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
              if (!secondaryPlanAccountIds.has(accId)) {
                allAnalyticAccountIds.add(accId);
                // Associate with order if matching project_id
                if (al.project_id && Array.isArray(al.project_id)) {
                  const linkedOrders = projectToOrderIds.get(al.project_id[0]);
                  if (linkedOrders) {
                    for (const ordId of linkedOrders) {
                      if (orderToAnalyticIds.has(ordId)) {
                        orderToAnalyticIds.get(ordId)!.add(accId);
                      }
                    }
                  }
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
    // [["analytic_line_ids.account_id", "in", [ID_DU_COMPTE_ANALYTIQUE]], ["parent_state", "=", "posted"]]
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
          'balance',
          'move_type',
          'analytic_account_id',
          'analytic_distribution',
          'analytic_line_ids',
          'date',
          'parent_state'
        ];
        const safeAmlFields = amlFieldsSet.size > 0
          ? candidateAmlFields.filter(f => amlFieldsSet.has(f) || f === 'id')
          : ['id', 'name', 'ref', 'move_id', 'price_subtotal', 'debit', 'credit', 'balance'];

        // Primary Query: using analytic_line_ids.account_id (standard Odoo query like Make)
        // We include posted vendor bills, refunds/avoirs, and journal entries (extournes/provisions)
        try {
          const makeDomain: any[] = [
            ['analytic_line_ids.account_id', 'in', updatedAnalyticIdsList],
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
              limit: 4000
            }
          );

          if (Array.isArray(resMake)) {
            resMake.forEach(line => {
              if (line && line.id && !seenPurchaseLineIds.has(line.id)) {
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
                limit: 4000
              }
            );

            if (Array.isArray(resDirect)) {
              resDirect.forEach(line => {
                if (line && line.id && !seenPurchaseLineIds.has(line.id)) {
                  seenPurchaseLineIds.add(line.id);
                  purchaseLines.push(line);
                }
              });
            }
          } catch (eDirect) {
            console.warn('Query with direct analytic_account_id fallback:', eDirect);
          }
        }

        // Also query fallback if needed
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
                limit: 4000
              }
            );
            if (Array.isArray(resFallback)) {
              resFallback.forEach(line => {
                if (line && line.id && !seenPurchaseLineIds.has(line.id)) {
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

    // 7.5. Query Pending Purchase Order Lines (purchase.order.line)
    // Filter on confirmed purchase orders ('order_id.state' IN ('purchase', 'done'))
    // Calculate pending amount: (qty_ordered - qty_invoiced) * price_unit
    let purchaseOrderLines: any[] = [];
    const seenPoLineIds = new Set<number>();

    if (updatedAnalyticIdsList.length > 0) {
      try {
        const polFieldDefs = await this.getModelFields(creds, uid, 'purchase.order.line');
        const polFieldsSet = new Set(Object.keys(polFieldDefs));

        const candidatePolFields = [
          'id',
          'name',
          'order_id',
          'partner_id',
          'product_id',
          'product_qty',
          'product_uom_qty',
          'qty_invoiced',
          'price_unit',
          'price_subtotal',
          'account_analytic_id',
          'analytic_account_id',
          'analytic_distribution',
          'date_order',
          'date_approve',
          'state'
        ];
        const safePolFields = polFieldsSet.size > 0
          ? candidatePolFields.filter(f => polFieldsSet.has(f) || f === 'id')
          : ['id', 'name', 'order_id', 'partner_id', 'product_id', 'product_qty', 'qty_invoiced', 'price_unit', 'price_subtotal'];

        // Domain 1: Using account_analytic_id (Odoo <= 15)
        if (polFieldsSet.has('account_analytic_id')) {
          try {
            const domainA: any[] = [
              ['account_analytic_id', 'in', updatedAnalyticIdsList],
              ['order_id.state', 'in', ['purchase', 'done']]
            ];
            if (asOfDate && polFieldsSet.has('date_order')) {
              domainA.push(['date_order', '<=', asOfDate]);
            }
            const resA = await this.executeKw(
              creds,
              uid,
              'purchase.order.line',
              'search_read',
              [domainA],
              { fields: safePolFields, limit: 3000 }
            );
            if (Array.isArray(resA)) {
              resA.forEach(line => {
                if (!seenPoLineIds.has(line.id)) {
                  seenPoLineIds.add(line.id);
                  purchaseOrderLines.push(line);
                }
              });
            }
          } catch (eA) {
            try {
              const domainAFallback: any[] = [
                ['account_analytic_id', 'in', updatedAnalyticIdsList]
              ];
              if (polFieldsSet.has('state')) {
                domainAFallback.push(['state', 'in', ['purchase', 'done']]);
              }
              const resAFallback = await this.executeKw(
                creds,
                uid,
                'purchase.order.line',
                'search_read',
                [domainAFallback],
                { fields: safePolFields, limit: 3000 }
              );
              if (Array.isArray(resAFallback)) {
                resAFallback.forEach(line => {
                  if (!seenPoLineIds.has(line.id)) {
                    seenPoLineIds.add(line.id);
                    purchaseOrderLines.push(line);
                  }
                });
              }
            } catch (errAFallback) {
              console.warn('POL query with account_analytic_id fallback error:', errAFallback);
            }
          }
        }

        // Domain 2: Using analytic_account_id
        if (polFieldsSet.has('analytic_account_id')) {
          try {
            const domainB: any[] = [
              ['analytic_account_id', 'in', updatedAnalyticIdsList],
              ['order_id.state', 'in', ['purchase', 'done']]
            ];
            if (asOfDate && polFieldsSet.has('date_order')) {
              domainB.push(['date_order', '<=', asOfDate]);
            }
            const resB = await this.executeKw(
              creds,
              uid,
              'purchase.order.line',
              'search_read',
              [domainB],
              { fields: safePolFields, limit: 3000 }
            );
            if (Array.isArray(resB)) {
              resB.forEach(line => {
                if (!seenPoLineIds.has(line.id)) {
                  seenPoLineIds.add(line.id);
                  purchaseOrderLines.push(line);
                }
              });
            }
          } catch (eB) {
            console.warn('POL query with analytic_account_id fallback:', eB);
          }
        }

        // Domain 3: Using analytic_distribution (Odoo 16+)
        if (polFieldsSet.has('analytic_distribution')) {
          try {
            const domainC: any[] = [
              ['analytic_distribution', '!=', false]
            ];
            if (polFieldsSet.has('state')) {
              domainC.push(['state', 'in', ['purchase', 'done']]);
            } else {
              domainC.push(['order_id.state', 'in', ['purchase', 'done']]);
            }
            if (asOfDate && polFieldsSet.has('date_order')) {
              domainC.push(['date_order', '<=', asOfDate]);
            }
            const resC = await this.executeKw(
              creds,
              uid,
              'purchase.order.line',
              'search_read',
              [domainC],
              { fields: safePolFields, limit: 3000 }
            );
            if (Array.isArray(resC)) {
              resC.forEach(line => {
                if (!seenPoLineIds.has(line.id)) {
                  seenPoLineIds.add(line.id);
                  purchaseOrderLines.push(line);
                }
              });
            }
          } catch (eC) {
            console.warn('POL query with analytic_distribution error:', eC);
          }
        }
      } catch (ePol) {
        console.warn('purchase.order.line search failed (non-fatal):', ePol);
        purchaseOrderLines = [];
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
      const seenTsIds = new Set<number>();
      const orderTimesheets: any[] = [];
      for (const al of branch1Timesheets) {
        if (al.id && seenTsIds.has(al.id)) {
          continue;
        }
        if (al.id) {
          seenTsIds.add(al.id);
        }

        const unitAmount = Number(al.unit_amount) || 0;
        const amountVal = Number(al.amount) || 0;
        const isTsExtourne = (
          String(al.name || '').toLowerCase().includes('extourne') ||
          String(al.ref || '').toLowerCase().includes('extourne') ||
          String(al.name || '').toLowerCase().includes('annulation') ||
          String(al.name || '').toLowerCase().includes('reversal')
        );

        let effectiveHours = unitAmount;
        if (isTsExtourne && effectiveHours > 0) {
          effectiveHours = -effectiveHours;
        } else if (amountVal > 0 && effectiveHours > 0) {
          // If amount is positive in timesheet, it represents a reversal/correction of hours
          effectiveHours = -effectiveHours;
        }

        orderTimesheets.push({
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
        });
      }

      const totalHours = Math.round(orderTimesheets.reduce((sum, ts) => sum + (ts.effective_hours !== undefined ? ts.effective_hours : ts.unit_amount), 0) * 100) / 100;

      // 2. BRANCHE 2 : FACTURES FOURNISSEURS & ACHATS MATÉRIEL
      const seenBillMoveLineIds = new Set<number>();
      const seenAnalyticLineIdsForOrder = new Set<number>();
      const orderPurchases: any[] = [];

      for (const pl of (Array.isArray(purchaseLines) ? purchaseLines : [])) {
        if (asOfDate && pl.date && String(pl.date).slice(0, 10) > asOfDate) {
          continue;
        }
        if (pl.id && seenBillMoveLineIds.has(pl.id)) {
          continue;
        }
        if (pl.move_type && ['out_invoice', 'out_refund'].includes(pl.move_type)) {
          continue;
        }
        const plMoveNameCand = Array.isArray(pl.move_id) ? String(pl.move_id[1] || '') : '';
        if (isExcludedPurchaseReference(pl.ref) || isExcludedPurchaseReference(plMoveNameCand) || isExcludedPurchaseReference(pl.name)) {
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
        const parsedDist = parseDistributionKeys(dist);

        if (parsedDist.length > 0) {
          for (const entry of parsedDist) {
            // A distribution entry belongs to this order IF AND ONLY IF it includes one of this order's project analytic accounts
            const hasOrderAccount = entry.accountIds.some(accId => orderAnalyticSet.has(accId));
            if (hasOrderAccount) {
              matchedPercentage += entry.percentage;
            }
          }
        } else if (pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && orderAnalyticSet.has(pl.analytic_account_id[0])) {
          matchedPercentage = 100;
        }

        if (matchedPercentage > 0) {
          if (pl.id) {
            seenBillMoveLineIds.add(pl.id);
          }
          if (Array.isArray(pl.analytic_line_ids)) {
            for (const aalId of pl.analytic_line_ids) {
              if (typeof aalId === 'number') {
                seenAnalyticLineIdsForOrder.add(aalId);
              }
            }
          }

          const debit = Number(pl.debit) || 0;
          const credit = Number(pl.credit) || 0;
          const balance = pl.balance !== undefined && pl.balance !== null ? Number(pl.balance) : (debit - credit);

          const plName = String(pl.name || '').toLowerCase();
          const plRef = String(pl.ref || '').toLowerCase();
          const plMoveName = Array.isArray(pl.move_id) ? String(pl.move_id[1] || '').toLowerCase() : '';
          const isExtourneOrCreditNote = (
            credit > debit ||
            balance < 0 ||
            plName.includes('extourne') ||
            plRef.includes('extourne') ||
            plMoveName.includes('extourne') ||
            plName.includes('annulation') ||
            plRef.includes('annulation') ||
            plName.includes('reversal') ||
            plName.includes('avoir') ||
            String(pl.move_type || '').includes('refund')
          );

          let rawSubtotal = 0;
          if (debit > 0 || credit > 0) {
            // In European / Odoo accounting for vendor bills & costs: debit is positive expense (+), credit is reversal/extourne/refund (-)
            rawSubtotal = debit - credit;
          } else if (pl.price_subtotal !== undefined && pl.price_subtotal !== null && Number(pl.price_subtotal) !== 0) {
            const sub = Number(pl.price_subtotal);
            rawSubtotal = isExtourneOrCreditNote ? (sub < 0 ? sub : -Math.abs(sub)) : sub;
          } else {
            rawSubtotal = balance;
          }

          // Ensure if marked as extourne/credit note, sign is strictly negative
          if (isExtourneOrCreditNote && rawSubtotal > 0) {
            rawSubtotal = -rawSubtotal;
          }

          const allocatedSubtotal = Math.round(rawSubtotal * (matchedPercentage / 100) * 100) / 100;

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
            analytic_distribution: parsedDist.length > 0 ? dist : undefined,
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
        if (al.id && seenAnalyticLineIdsForOrder.has(al.id)) {
          continue; // Déjà pris en compte depuis account.move.line ou doublon
        }

        const moveLineId = al.move_line_id ? (Array.isArray(al.move_line_id) ? al.move_line_id[0] : Number(al.move_line_id)) : null;
        if (moveLineId && seenBillMoveLineIds.has(moveLineId)) {
          continue; // Déjà pris en compte depuis account.move.line
        }
        if (moveLineId) {
          seenBillMoveLineIds.add(moveLineId);
        }
        if (al.id) {
          seenAnalyticLineIdsForOrder.add(al.id);
        }

        const rawAmount = Number(al.amount) || 0;
        // In standard Odoo account.analytic.line:
        // Expenses/purchases are stored with negative amounts (amount < 0), e.g. -1020.80 €
        // Extournes/reversals/credit notes are positive (amount > 0), e.g. +1020.80 €
        // To represent cost in the report: costVal = -rawAmount (so positive for expenses, negative for extournes)
        let costVal = -rawAmount;

        const alName = String(al.name || '').toLowerCase();
        const alRef = String(al.ref || '').toLowerCase();
        const isExplicitExtourne = (
          alName.includes('extourne') ||
          alRef.includes('extourne') ||
          alName.includes('annulation') ||
          alRef.includes('annulation') ||
          alName.includes('reversal') ||
          alName.includes('avoir')
        );

        if (isExplicitExtourne && costVal > 0) {
          costVal = -costVal;
        }

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
          price_subtotal: Math.round(costVal * 100) / 100,
          original_price_subtotal: Math.round(costVal * 100) / 100,
          prorata_percentage: 100,
          date: al.date || '',
          parent_state: 'posted',
          analytic_account_id: al.account_id || false
        });
      }

      // Sum of prorated vendor bills and purchases
      const vendorBillsTotal = Math.round(orderPurchases.reduce((sum, pl) => sum + (Number(pl.price_subtotal) || 0), 0) * 100) / 100;

      // 3. BRANCHE 3 : PRAGMAS / RÉGULATIONS DIRECTES (RÉSIDUEL)
      const seenPragmaLineIds = new Set<number>();
      const orderManualAnalyticLines: any[] = [];

      for (const al of branch3Pragmas) {
        if (al.id && (seenPragmaLineIds.has(al.id) || seenAnalyticLineIdsForOrder.has(al.id))) {
          continue;
        }
        if (al.id) {
          seenPragmaLineIds.add(al.id);
        }

        const rawAmount = Number(al.amount) || 0;
        // Inversion du signe Odoo pour l'imputation en coût effectif :
        // Un montant Odoo positif (ex: extourne/crédit de +125 000 €) vient déduire les coûts (-125 000 €)
        // Un montant Odoo négatif (ex: charge d'achat direct de -450 €) vient s'additionner aux coûts (+450 €)
        const costAmount = -rawAmount;

        orderManualAnalyticLines.push({
          id: al.id,
          name: al.name || 'Régulation Pragma / Écriture directe',
          amount: Math.round(costAmount * 100) / 100,
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
        });
      }

      // Sum of direct manual analytic costs (Pragma / encours / régulations directes)
      const manualAnalyticCostsTotal = Math.round(orderManualAnalyticLines.reduce((sum, mal) => sum + mal.amount, 0) * 100) / 100;

      // 4. BRANCHE 4 : BONS DE COMMANDE D'ACHAT ENGAGÉS NON ENCORE FACTURÉS (PURCHASE ORDERS)
      // Formule demandée : montant_engage_non_facture = (qty_ordered - qty_invoiced) * price_unit
      const seenOrderPoLineIds = new Set<number>();
      const orderPurchaseOrderLines: any[] = [];
      for (const pol of (Array.isArray(purchaseOrderLines) ? purchaseOrderLines : [])) {
        if (asOfDate && pol.date_order && String(pol.date_order).slice(0, 10) > asOfDate) {
          continue;
        }
        if (pol.id && seenOrderPoLineIds.has(pol.id)) {
          continue;
        }

        const poNameCand = pol.order_id && Array.isArray(pol.order_id) ? pol.order_id[1] : `PO #${pol.id}`;
        if (isExcludedPurchaseReference(poNameCand) || isExcludedPurchaseReference(pol.name)) {
          continue;
        }

        // Parse analytic_distribution (JSON object ou string)
        let dist: Record<string, number> = {};
        if (typeof pol.analytic_distribution === 'string') {
          try {
            dist = JSON.parse(pol.analytic_distribution);
          } catch {
            dist = {};
          }
        } else if (pol.analytic_distribution && typeof pol.analytic_distribution === 'object') {
          dist = pol.analytic_distribution;
        }

        let matchedPercentage = 0;
        const parsedDist = parseDistributionKeys(dist);

        if (parsedDist.length > 0) {
          for (const entry of parsedDist) {
            // Must contain an analytic account belonging to this order's project analytic accounts
            const hasOrderAccount = entry.accountIds.some(accId => orderAnalyticSet.has(accId));
            if (hasOrderAccount) {
              matchedPercentage += entry.percentage;
            }
          }
        } else if (pol.account_analytic_id && Array.isArray(pol.account_analytic_id) && orderAnalyticSet.has(pol.account_analytic_id[0])) {
          matchedPercentage = 100;
        } else if (pol.analytic_account_id && Array.isArray(pol.analytic_account_id) && orderAnalyticSet.has(pol.analytic_account_id[0])) {
          matchedPercentage = 100;
        }

        if (matchedPercentage > 0) {
          if (pol.id) {
            seenOrderPoLineIds.add(pol.id);
          }

          const qtyOrdered = Number(pol.product_qty !== undefined ? pol.product_qty : (pol.product_uom_qty || 0));
          const qtyInvoiced = Number(pol.qty_invoiced || 0);
          const priceUnit = Number(pol.price_unit || 0);
          const qtyToInvoice = Math.max(0, qtyOrdered - qtyInvoiced);
          const rawAmountToInvoice = Math.round(qtyToInvoice * priceUnit * 100) / 100;
          const proratedAmountToInvoice = Math.round(rawAmountToInvoice * (matchedPercentage / 100) * 100) / 100;

          if (qtyToInvoice > 0 || proratedAmountToInvoice > 0) {
            orderPurchaseOrderLines.push({
              id: pol.id,
              name: pol.name || (Array.isArray(pol.product_id) ? pol.product_id[1] : 'Ligne commande achat'),
              order_id: pol.order_id || false,
              order_name: Array.isArray(pol.order_id) ? pol.order_id[1] : '',
              partner_id: pol.partner_id || false,
              product_id: pol.product_id || false,
              product_qty: qtyOrdered,
              qty_invoiced: qtyInvoiced,
              qty_to_invoice: Math.round(qtyToInvoice * 100) / 100,
              price_unit: priceUnit,
              price_subtotal: Number(pol.price_subtotal) || (qtyOrdered * priceUnit),
              amount_to_invoice: proratedAmountToInvoice,
              original_amount_to_invoice: rawAmountToInvoice,
              prorata_percentage: matchedPercentage,
              date_order: pol.date_order || '',
              date_approve: pol.date_approve || '',
              state: pol.state || 'purchase',
              analytic_account_id: pol.analytic_account_id || pol.account_analytic_id || false,
              analytic_distribution: parsedDist.length > 0 ? dist : undefined
            });
          }
        }
      }

      // Sum of pending purchase orders for this sale order
      const purchaseOrdersPending = Math.round(orderPurchaseOrderLines.reduce((sum, pol) => sum + (Number(pol.amount_to_invoice) || 0), 0) * 100) / 100;

      // Total factures + pragma (comptabilisés)
      const totalPurchases = Math.round((vendorBillsTotal + manualAnalyticCostsTotal) * 100) / 100;

      // Total Coûts Matériel/Achats Engagés = Factures Fournisseurs (€ HT) + BDC Achats Engagés non facturés (€ HT) + Pragmas
      const totalCommittedCosts = Math.round((vendorBillsTotal + manualAnalyticCostsTotal + purchaseOrdersPending) * 100) / 100;

      // 2 Hourly Valuations:
      // 1. Total hours * 77.76 €/h
      // 2. Total hours * 90.00 €/h
      const valuation77_76 = Math.round(totalHours * 77.76 * 100) / 100;
      const valuation90 = Math.round(totalHours * 90.00 * 100) / 100;

      const amountUntaxed = Number(so.amount_untaxed) || 0;
      const amountTotal = Number(so.amount_total) || 0;

      // Marge Prévisionnelle Réelle = Ventes HT - Total Coûts Engagés (Factures + BDC + Pragma) - Valorisation Heures (77.76 €)
      const grossMargin = Math.round((amountUntaxed - totalCommittedCosts - valuation77_76) * 100) / 100;
      const marginRate = amountUntaxed > 0 ? Math.round(((grossMargin / amountUntaxed) * 100) * 10) / 10 : 0;
      const hourlyMarginRate = totalHours > 0 ? Math.round((grossMargin / totalHours) * 100) / 100 : 0;

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
        purchaseOrdersPending: Math.round(purchaseOrdersPending * 100) / 100,
        purchaseOrdersPendingTotal: Math.round(purchaseOrdersPending * 100) / 100,
        totalCommittedCosts: Math.round(totalCommittedCosts * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        marginRate: Math.round(marginRate * 10) / 10,
        hourlyMarginRate: Math.round(hourlyMarginRate * 100) / 100,
        valuation77_76,
        valuation90,
        timesheets: orderTimesheets,
        vendorBills: orderPurchases,
        manualAnalyticLines: orderManualAnalyticLines,
        purchaseOrderLines: orderPurchaseOrderLines
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
    const totalPurchaseOrdersPending = reportRows.reduce((acc, row) => acc + (row.purchaseOrdersPending || 0), 0);
    const totalValuation77_76 = Math.round(totalTimesheetHours * 77.76 * 100) / 100;
    const totalValuation90 = Math.round(totalTimesheetHours * 90.00 * 100) / 100;
    const totalGrossMargin = Math.round((totalSalesUntaxed - (totalVendorBills + totalManualAnalyticCosts + totalPurchaseOrdersPending) - totalValuation77_76) * 100) / 100;
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
        totalPurchaseOrdersPending: Math.round(totalPurchaseOrdersPending * 100) / 100,
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
      totalPurchaseOrdersPending: number;
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

    let poLines = (MOCK_DATA['purchase.order.line'] || []).filter(
      pol => !pol.state || pol.state === 'purchase' || pol.state === 'done'
    );
    if (asOfDate) {
      poLines = poLines.filter(pol => !pol.date_order || String(pol.date_order).slice(0, 10) <= asOfDate);
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

      // 1. Timesheets:
      const seenTsIds = new Set<number>();
      const orderTimesheets: any[] = [];
      for (const al of branch1Timesheets) {
        if (al.id && seenTsIds.has(al.id)) continue;
        if (al.id) seenTsIds.add(al.id);

        const unitAmount = Number(al.unit_amount) || 0;
        const amountVal = Number(al.amount) || 0;
        const isTsExtourne = (
          String(al.name || '').toLowerCase().includes('extourne') ||
          String(al.ref || '').toLowerCase().includes('extourne') ||
          String(al.name || '').toLowerCase().includes('annulation') ||
          String(al.name || '').toLowerCase().includes('reversal')
        );

        let effectiveHours = unitAmount;
        if (isTsExtourne && effectiveHours > 0) {
          effectiveHours = -effectiveHours;
        } else if (amountVal > 0 && effectiveHours > 0) {
          effectiveHours = -effectiveHours;
        }

        orderTimesheets.push({
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
        });
      }

      const totalHours = Math.round(orderTimesheets.reduce((sum, ts) => sum + (ts.effective_hours !== undefined ? ts.effective_hours : ts.unit_amount), 0) * 100) / 100;

      // 2. Vendor bills & Purchases
      const seenBillMoveLineIds = new Set<number>();
      const seenAnalyticLineIdsForOrder = new Set<number>();
      const orderPurchases: any[] = [];

      for (const pl of purchaseLines) {
        if (analyticId && pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && pl.analytic_account_id[0] === analyticId) {
          if (pl.id && seenBillMoveLineIds.has(pl.id)) continue;
          if (pl.id) seenBillMoveLineIds.add(pl.id);

          const debit = Number(pl.debit) || 0;
          const credit = Number(pl.credit) || 0;
          const balance = pl.balance !== undefined && pl.balance !== null ? Number(pl.balance) : (debit - credit);
          const plName = String(pl.name || '').toLowerCase();
          const plRef = String(pl.ref || '').toLowerCase();
          const isExtourneOrCredit = (
            credit > debit ||
            balance < 0 ||
            plName.includes('extourne') ||
            plRef.includes('extourne') ||
            plName.includes('annulation') ||
            plRef.includes('annulation') ||
            plName.includes('reversal') ||
            plName.includes('avoir')
          );

          let rawSubtotal = 0;
          if (debit > 0 || credit > 0) {
            rawSubtotal = debit - credit;
          } else if (pl.price_subtotal !== undefined && pl.price_subtotal !== null && Number(pl.price_subtotal) !== 0) {
            const sub = Number(pl.price_subtotal);
            rawSubtotal = isExtourneOrCredit ? (sub < 0 ? sub : -Math.abs(sub)) : sub;
          } else {
            rawSubtotal = balance;
          }

          if (isExtourneOrCredit && rawSubtotal > 0) {
            rawSubtotal = -rawSubtotal;
          }

          orderPurchases.push({
            ...pl,
            price_subtotal: rawSubtotal,
            original_price_subtotal: rawSubtotal
          });
        }
      }

      for (const al of branch2PurchasesFromAal) {
        if (al.id && seenAnalyticLineIdsForOrder.has(al.id)) continue;
        const moveLineId = al.move_line_id ? (Array.isArray(al.move_line_id) ? al.move_line_id[0] : Number(al.move_line_id)) : null;
        if (moveLineId && seenBillMoveLineIds.has(moveLineId)) continue;
        if (moveLineId) seenBillMoveLineIds.add(moveLineId);
        if (al.id) seenAnalyticLineIdsForOrder.add(al.id);

        const rawAmount = Number(al.amount) || 0;
        let costVal = -rawAmount;
        const alName = String(al.name || '').toLowerCase();
        const alRef = String(al.ref || '').toLowerCase();
        const isExplicitExtourne = (
          alName.includes('extourne') ||
          alRef.includes('extourne') ||
          alName.includes('annulation') ||
          alRef.includes('annulation') ||
          alName.includes('reversal') ||
          alName.includes('avoir')
        );

        if (isExplicitExtourne && costVal > 0) {
          costVal = -costVal;
        }

        orderPurchases.push({
          id: al.id ? `aal-${al.id}` : (moveLineId || Math.random()),
          name: al.name || 'Achat fournisseur (analytique)',
          ref: al.ref || (Array.isArray(al.move_line_id) ? al.move_line_id[1] : ''),
          move_id: al.move_line_id || false,
          partner_id: al.partner_id || false,
          price_subtotal: Math.round(costVal * 100) / 100,
          original_price_subtotal: Math.round(costVal * 100) / 100,
          prorata_percentage: 100,
          date: al.date || '',
          parent_state: 'posted',
          analytic_account_id: al.account_id || false
        });
      }

      // 3. Manual analytic direct costs (Pragma)
      const seenPragmaIds = new Set<number>();
      const orderManualAnalyticLines: any[] = [];
      for (const al of branch3Pragmas) {
        if (al.id && (seenPragmaIds.has(al.id) || seenAnalyticLineIdsForOrder.has(al.id))) continue;
        if (al.id) seenPragmaIds.add(al.id);

        const rawAmount = Number(al.amount) || 0;
        // Inversion du signe Odoo pour l'imputation en coût effectif :
        // Un montant Odoo positif (ex: extourne/crédit de +125 000 €) vient déduire les coûts (-125 000 €)
        // Un montant Odoo négatif (ex: charge d'achat direct de -450 €) vient s'additionner aux coûts (+450 €)
        const costAmount = -rawAmount;

        orderManualAnalyticLines.push({
          id: al.id,
          name: al.name || 'Écriture analytique directe / Pragma',
          amount: Math.round(costAmount * 100) / 100,
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
        });
      }

      // Purchase Order Lines
      const orderPurchaseOrderLines: any[] = [];
      for (const pol of poLines) {
        let matched = false;
        if (analyticId && pol.analytic_account_id && Array.isArray(pol.analytic_account_id) && pol.analytic_account_id[0] === analyticId) {
          matched = true;
        } else if (analyticId && pol.account_analytic_id && Array.isArray(pol.account_analytic_id) && pol.account_analytic_id[0] === analyticId) {
          matched = true;
        }

        if (matched) {
          const qtyOrdered = Number(pol.product_qty || pol.product_uom_qty || 0);
          const qtyInvoiced = Number(pol.qty_invoiced || 0);
          const priceUnit = Number(pol.price_unit || 0);
          const qtyToInvoice = Math.max(0, qtyOrdered - qtyInvoiced);
          const amountToInvoice = Math.round(qtyToInvoice * priceUnit * 100) / 100;

          if (qtyToInvoice > 0 || amountToInvoice > 0) {
            orderPurchaseOrderLines.push({
              id: pol.id,
              name: pol.name || (Array.isArray(pol.product_id) ? pol.product_id[1] : 'Ligne commande achat'),
              order_id: pol.order_id || false,
              order_name: Array.isArray(pol.order_id) ? pol.order_id[1] : '',
              partner_id: pol.partner_id || false,
              product_id: pol.product_id || false,
              product_qty: qtyOrdered,
              qty_invoiced: qtyInvoiced,
              qty_to_invoice: qtyToInvoice,
              price_unit: priceUnit,
              price_subtotal: Number(pol.price_subtotal) || (qtyOrdered * priceUnit),
              amount_to_invoice: amountToInvoice,
              original_amount_to_invoice: amountToInvoice,
              prorata_percentage: 100,
              date_order: pol.date_order || '',
              date_approve: pol.date_approve || '',
              state: pol.state || 'purchase',
              analytic_account_id: pol.analytic_account_id || pol.account_analytic_id || false
            });
          }
        }
      }

      const vendorBillsTotal = orderPurchases.reduce((sum, pl) => sum + (Number(pl.price_subtotal) || 0), 0);
      const manualAnalyticCostsTotal = orderManualAnalyticLines.reduce((sum, mal) => sum + mal.amount, 0);
      const purchaseOrdersPending = Math.round(orderPurchaseOrderLines.reduce((sum, pol) => sum + (Number(pol.amount_to_invoice) || 0), 0) * 100) / 100;
      const totalPurchases = vendorBillsTotal + manualAnalyticCostsTotal;
      const totalCommittedCosts = vendorBillsTotal + manualAnalyticCostsTotal + purchaseOrdersPending;

      const valuation77_76 = Math.round(totalHours * 77.76 * 100) / 100;
      const valuation90 = Math.round(totalHours * 90.00 * 100) / 100;

      const amountUntaxed = Number(so.amount_untaxed) || 0;
      const amountTotal = Number(so.amount_total) || 0;

      const grossMargin = Math.round((amountUntaxed - totalCommittedCosts - valuation77_76) * 100) / 100;
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
        purchaseOrdersPending: Math.round(purchaseOrdersPending * 100) / 100,
        purchaseOrdersPendingTotal: Math.round(purchaseOrdersPending * 100) / 100,
        totalCommittedCosts: Math.round(totalCommittedCosts * 100) / 100,
        grossMargin: Math.round(grossMargin * 100) / 100,
        marginRate: Math.round(marginRate * 10) / 10,
        hourlyMarginRate: Math.round(hourlyMarginRate * 100) / 100,
        valuation77_76,
        valuation90,
        timesheets: orderTimesheets,
        vendorBills: orderPurchases,
        manualAnalyticLines: orderManualAnalyticLines,
        purchaseOrderLines: orderPurchaseOrderLines
      };
    });

    // Sort mock records descending by reference name (e.g. FMF269999, fmf260811, SO/2026/00135, etc.)
    reportRows.sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' }));

    const totalSalesUntaxed = reportRows.reduce((acc, row) => acc + row.amount_untaxed, 0);
    const totalTimesheetHours = reportRows.reduce((acc, row) => acc + row.totalHours, 0);
    const totalPurchasesInvoiced = reportRows.reduce((acc, row) => acc + row.totalPurchases, 0);
    const totalVendorBills = reportRows.reduce((acc, row) => acc + (row.vendorBillsTotal || 0), 0);
    const totalManualAnalyticCosts = reportRows.reduce((acc, row) => acc + (row.manualAnalyticCostsTotal || 0), 0);
    const totalPurchaseOrdersPending = reportRows.reduce((acc, row) => acc + (row.purchaseOrdersPending || 0), 0);
    const totalValuation77_76 = Math.round(totalTimesheetHours * 77.76 * 100) / 100;
    const totalValuation90 = Math.round(totalTimesheetHours * 90.00 * 100) / 100;
    const totalGrossMargin = Math.round((totalSalesUntaxed - (totalVendorBills + totalManualAnalyticCosts + totalPurchaseOrdersPending) - totalValuation77_76) * 100) / 100;
    const averageMarginRate = totalSalesUntaxed > 0 ? Math.round(((totalGrossMargin / totalSalesUntaxed) * 100) * 10) / 10 : 0;

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
        totalPurchaseOrdersPending: Math.round(totalPurchaseOrdersPending * 100) / 100,
        totalGrossMargin: Math.round(totalGrossMargin * 100) / 100,
        averageMarginRate: Math.round(averageMarginRate * 10) / 10,
        totalValuation77_76,
        totalValuation90
      },
      fromCache: false,
      executionTimeMs: 14
    };
  }

  // =========================================================================
  // SUIVI ET CONTRÔLE DES POINTAGES (TIMESHEETS MANQUANTS)
  // =========================================================================

  /**
   * Helper: Générer la liste des jours entre startDate et endDate au format YYYY-MM-DD
   */
  private generateDateRange(startDateStr: string, endDateStr: string): {
    date: string;
    formattedDate: string;
    shortDay: string;
    dayOfWeek: number;
    isWeekend: boolean;
  }[] {
    const days: {
      date: string;
      formattedDate: string;
      shortDay: string;
      dayOfWeek: number;
      isWeekend: boolean;
    }[] = [];

    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return [];
    }

    const current = new Date(start);
    // Ensure loop safety with maximum 90 days range
    let iterations = 0;
    while (current <= end && iterations < 120) {
      iterations++;
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dow = current.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const dayName = dayNames[dow];

      days.push({
        date: dateStr,
        formattedDate: `${dayName} ${dd}/${mm}`,
        shortDay: `${dayName} ${dd}`,
        dayOfWeek: dow,
        isWeekend
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /**
   * Rapport Réel Odoo : Contrôle des Pointages / Suivi des Feuilles de Temps
   */
  public async getTimesheetsAuditReport(
    creds: OdooConnectionCredentials,
    options: {
      startDate?: string;
      endDate?: string;
      thresholdHours?: number;
      hideWeekends?: boolean;
      employeeIds?: number[];
      forceRefresh?: boolean;
    } = {}
  ): Promise<{
    records: any[];
    totalCount: number;
    summary: any;
    fromCache: boolean;
    executionTimeMs: number;
    startDate: string;
    endDate: string;
    thresholdHours: number;
    hideWeekends: boolean;
  }> {
    const startTime = Date.now();
    const thresholdHours = Number(options.thresholdHours) || 7.0;
    const hideWeekends = options.hideWeekends !== false;

    // Default dates: last 7 days ending today (clamped to 2026-01-01 minimum)
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 6);
    const defaultStartStr = defaultStart.toISOString().slice(0, 10);

    const minAllowedDate = '2026-01-01';
    let startDate = options.startDate || defaultStartStr;
    let endDate = options.endDate || todayStr;

    if (startDate < minAllowedDate) startDate = minAllowedDate;
    if (endDate < minAllowedDate) endDate = minAllowedDate;
    if (startDate > endDate) startDate = endDate;

    const cacheKey = `timesheets_audit_${creds.url}_${creds.db}_${startDate}_${endDate}_${thresholdHours}_${hideWeekends}`;
    if (!options.forceRefresh) {
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
      throw this.formatOdooError(authRes.error, creds);
    }
    const uid = authRes.uid;

    // 1. Récupérer les employés actifs depuis hr.employee (ou fallback res.users)
    let rawEmployees: any[] = [];
    try {
      rawEmployees = await this.executeKw(
        creds,
        uid,
        'hr.employee',
        'search_read',
        [[['active', '=', true]]],
        {
          fields: ['id', 'name', 'work_email', 'department_id', 'job_title', 'user_id', 'active'],
          order: 'name asc',
          limit: 250
        }
      );
    } catch (empErr) {
      console.warn('[TimesheetsAudit] hr.employee search_read failed, trying res.users fallback:', empErr);
      try {
        const users = await this.executeKw(
          creds,
          uid,
          'res.users',
          'search_read',
          [[['active', '=', true], ['share', '=', false]]],
          {
            fields: ['id', 'name', 'email', 'login'],
            order: 'name asc',
            limit: 250
          }
        );
        rawEmployees = (users || []).map((u: any) => ({
          id: u.id,
          name: u.name,
          work_email: u.email || u.login,
          department_id: false,
          job_title: 'Utilisateur interne',
          user_id: [u.id, u.name],
          active: true
        }));
      } catch (userErr) {
        console.error('[TimesheetsAudit] res.users fallback also failed:', userErr);
        rawEmployees = [];
      }
    }

    // 2. Récupérer toutes les feuilles de temps dans l'intervalle [startDate, endDate]
    const timesheetDomain: any[] = [
      ['date', '>=', startDate],
      ['date', '<=', endDate]
    ];

    let rawTimesheets: any[] = [];
    try {
      rawTimesheets = await this.executeKw(
        creds,
        uid,
        'account.analytic.line',
        'search_read',
        [timesheetDomain],
        {
          fields: [
            'id',
            'name',
            'date',
            'user_id',
            'employee_id',
            'unit_amount',
            'amount',
            'project_id',
            'task_id',
            'account_id'
          ],
          order: 'date asc',
          limit: 15000
        }
      );
    } catch (tsErr) {
      console.error('[TimesheetsAudit] Failed to fetch account.analytic.line:', tsErr);
      rawTimesheets = [];
    }

    // 3. Récupérer les derniers pointages récents pour chaque employé (pour afficher "Dernier pointage enregistré")
    let recentTimesheets: any[] = [];
    try {
      recentTimesheets = await this.executeKw(
        creds,
        uid,
        'account.analytic.line',
        'search_read',
        [[['unit_amount', '!=', 0]]],
        {
          fields: ['id', 'name', 'date', 'user_id', 'employee_id', 'unit_amount', 'task_id', 'project_id'],
          order: 'date desc, id desc',
          limit: 1000
        }
      );
    } catch {
      recentTimesheets = rawTimesheets;
    }

    const lastTsByEmployee = new Map<number, { date: string; hours: number; task: string }>();
    const lastTsByUser = new Map<number, { date: string; hours: number; task: string }>();

    for (const rts of (recentTimesheets || [])) {
      const empId = rts.employee_id && Array.isArray(rts.employee_id) ? rts.employee_id[0] : (typeof rts.employee_id === 'number' ? rts.employee_id : null);
      const uId = rts.user_id && Array.isArray(rts.user_id) ? rts.user_id[0] : (typeof rts.user_id === 'number' ? rts.user_id : null);
      const taskLabel = Array.isArray(rts.task_id) ? rts.task_id[1] : (Array.isArray(rts.project_id) ? rts.project_id[1] : (rts.name || 'Pointage'));

      if (empId && !lastTsByEmployee.has(empId)) {
        lastTsByEmployee.set(empId, {
          date: rts.date || '',
          hours: Number(rts.unit_amount) || 0,
          task: taskLabel
        });
      }
      if (uId && !lastTsByUser.has(uId)) {
        lastTsByUser.set(uId, {
          date: rts.date || '',
          hours: Number(rts.unit_amount) || 0,
          task: taskLabel
        });
      }
    }

    // 4. Générer la matrice des jours
    const dateList = this.generateDateRange(startDate, endDate);

    // Filter employees if employeeIds provided
    const targetEmployees = (options.employeeIds && options.employeeIds.length > 0)
      ? rawEmployees.filter(e => options.employeeIds!.includes(e.id))
      : rawEmployees;

    // Dé-doublonnage des feuilles de temps par ID
    const seenTsIds = new Set<number>();
    const validTimesheets: any[] = [];
    for (const ts of rawTimesheets) {
      if (ts.id && seenTsIds.has(ts.id)) continue;
      if (ts.id) seenTsIds.add(ts.id);
      validTimesheets.push(ts);
    }

    // 5. Construire les enregistrements par employé
    const records: any[] = [];
    const today = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

    for (const emp of targetEmployees) {
      const empId = emp.id;
      const uId = emp.user_id && Array.isArray(emp.user_id) ? emp.user_id[0] : null;

      // Filter timesheets matching this employee or user
      const empTimesheets = validTimesheets.filter(ts => {
        const tsEmpId = ts.employee_id && Array.isArray(ts.employee_id) ? ts.employee_id[0] : (typeof ts.employee_id === 'number' ? ts.employee_id : null);
        const tsUId = ts.user_id && Array.isArray(ts.user_id) ? ts.user_id[0] : (typeof ts.user_id === 'number' ? ts.user_id : null);

        if (tsEmpId && tsEmpId === empId) return true;
        if (uId && tsUId && tsUId === uId) return true;
        return false;
      });

      // Group timesheets by date
      const tsByDate = new Map<string, any[]>();
      for (const ts of empTimesheets) {
        const d = String(ts.date || '').slice(0, 10);
        if (!d) continue;
        if (!tsByDate.has(d)) {
          tsByDate.set(d, []);
        }
        tsByDate.get(d)!.push(ts);
      }

      const days: Record<string, any> = {};
      let totalHours = 0;
      let missingDaysCount = 0;
      let incompleteDaysCount = 0;
      let okDaysCount = 0;
      let businessDaysCount = 0;
      const missingDates: string[] = [];
      const incompleteDates: string[] = [];

      for (const dObj of dateList) {
        const d = dObj.date;
        const linesForDay = tsByDate.get(d) || [];
        const dayHours = Math.round(linesForDay.reduce((sum, l) => {
          const unit = Number(l.unit_amount) || 0;
          return sum + unit;
        }, 0) * 100) / 100;

        totalHours += dayHours;

        const isToday = d === today;
        const isFuture = d > today;
        const isBizDay = !dObj.isWeekend;

        let status: 'missing' | 'incomplete' | 'ok' | 'weekend' | 'future' | 'today' = 'ok';

        if (isFuture) {
          status = 'future';
        } else if (dObj.isWeekend) {
          // Weekend : 0h est tout à fait normal (repos).
          // Des heures pointées le weekend sont un supplément facultatif qui s'ajoute au total sans condition de conformité.
          if (dayHours > 0) {
            status = 'ok';
          } else {
            status = 'weekend';
          }
        } else if (isToday) {
          // Jour ouvré actuel : les collaborateurs pointent en fin de journée.
          // Ne doit pas être comptabilisé comme manquant ou incomplet dans les non-conformités.
          if (dayHours >= thresholdHours) {
            status = 'ok';
            okDaysCount++;
            businessDaysCount++;
          } else {
            status = 'today';
            // Pas de pénalité pour le jour en cours
          }
        } else if (dayHours === 0) {
          // Jour ouvré manquant (0h)
          status = 'missing';
          missingDaysCount++;
          missingDates.push(d);
          businessDaysCount++;
        } else if (dayHours < thresholdHours) {
          // Jour ouvré incomplet (< seuil)
          status = 'incomplete';
          incompleteDaysCount++;
          incompleteDates.push(d);
          businessDaysCount++;
        } else {
          // Jour ouvré conforme (>= seuil)
          status = 'ok';
          okDaysCount++;
          businessDaysCount++;
        }

        days[d] = {
          date: d,
          formattedDate: dObj.formattedDate,
          dayOfWeek: dObj.dayOfWeek,
          isWeekend: dObj.isWeekend,
          hours: dayHours,
          status,
          lines: linesForDay.map(l => ({
            id: l.id,
            name: l.name || 'Feuille de temps',
            projectName: Array.isArray(l.project_id) ? l.project_id[1] : (Array.isArray(l.account_id) ? l.account_id[1] : ''),
            taskName: Array.isArray(l.task_id) ? l.task_id[1] : '',
            unitAmount: Number(l.unit_amount) || 0,
            date: l.date || d
          }))
        };
      }

      // Expected hours based on business days in period
      const expectedHours = Math.round(businessDaysCount * thresholdHours * 100) / 100;
      const complianceRate = businessDaysCount > 0 
        ? Math.min(100, Math.round(((okDaysCount) / businessDaysCount) * 100))
        : 100;

      // Last recorded pointage
      const lastInfo = lastTsByEmployee.get(empId) || (uId ? lastTsByUser.get(uId) : null);

      const complianceStatus: 'OK' | 'NOK' | 'CHECK' = missingDaysCount > 0 
        ? 'NOK' 
        : incompleteDaysCount > 0 
        ? 'CHECK' 
        : 'OK';

      records.push({
        id: emp.id,
        name: emp.name,
        userId: emp.user_id || false,
        workEmail: emp.work_email || '',
        departmentName: Array.isArray(emp.department_id) ? emp.department_id[1] : (emp.department_id || 'Général'),
        jobTitle: emp.job_title || (Array.isArray(emp.job_id) ? emp.job_id[1] : 'Opérateur / Collaborateur'),
        totalHours: Math.round(totalHours * 100) / 100,
        expectedHours,
        businessDaysCount,
        missingDaysCount,
        incompleteDaysCount,
        okDaysCount,
        complianceRate,
        complianceStatus,
        missingDates,
        incompleteDates,
        lastRecordedDate: lastInfo?.date || '',
        lastRecordedHours: lastInfo?.hours !== undefined ? lastInfo.hours : undefined,
        lastRecordedTask: lastInfo?.task || '',
        days
      });
    }

    // Sort: employees with most missing days first, then incomplete, then alphabetically
    records.sort((a, b) => {
      if (b.missingDaysCount !== a.missingDaysCount) {
        return b.missingDaysCount - a.missingDaysCount;
      }
      if (b.incompleteDaysCount !== a.incompleteDaysCount) {
        return b.incompleteDaysCount - a.incompleteDaysCount;
      }
      return a.name.localeCompare(b.name, 'fr');
    });

    // Summary calculation
    const totalEmployees = records.length;
    const employeesWithMissingDays = records.filter(r => r.missingDaysCount > 0).length;
    const employeesFullyCompliant = records.filter(r => r.missingDaysCount === 0 && r.incompleteDaysCount === 0).length;
    const totalMissingDays = records.reduce((sum, r) => sum + r.missingDaysCount, 0);
    const totalIncompleteDays = records.reduce((sum, r) => sum + r.incompleteDaysCount, 0);
    const totalRecordedHours = Math.round(records.reduce((sum, r) => sum + r.totalHours, 0) * 100) / 100;
    const totalExpectedHours = Math.round(records.reduce((sum, r) => sum + r.expectedHours, 0) * 100) / 100;
    const overallComplianceRate = totalExpectedHours > 0 
      ? Math.min(100, Math.round((totalRecordedHours / totalExpectedHours) * 100))
      : 100;

    const summary = {
      totalEmployees,
      employeesWithMissingDays,
      employeesFullyCompliant,
      totalMissingDays,
      totalIncompleteDays,
      totalRecordedHours,
      totalExpectedHours,
      overallComplianceRate,
      businessDaysCount: dateList.filter(d => !d.isWeekend).length,
      dateList
    };

    const response = {
      records,
      totalCount: records.length,
      summary,
      fromCache: false,
      executionTimeMs: Date.now() - startTime,
      startDate,
      endDate,
      thresholdHours,
      hideWeekends
    };

    this.setCache(cacheKey, response);
    return response;
  }

  /**
   * Rapport Sandbox / Mock : Contrôle des Pointages / Suivi des Feuilles de Temps
   */
  public getMockTimesheetsAuditReport(options: {
    startDate?: string;
    endDate?: string;
    thresholdHours?: number;
    hideWeekends?: boolean;
    employeeIds?: number[];
  } = {}): {
    records: any[];
    totalCount: number;
    summary: any;
    fromCache: boolean;
    executionTimeMs: number;
    startDate: string;
    endDate: string;
    thresholdHours: number;
    hideWeekends: boolean;
  } {
    const thresholdHours = Number(options.thresholdHours) || 7.0;
    const hideWeekends = options.hideWeekends !== false;

    // Default dates: last 7 days ending 2026-09-01 (applet current time context)
    const minAllowedDate = '2026-01-01';
    let startDate = options.startDate || '2026-08-25';
    let endDate = options.endDate || '2026-09-01';

    if (startDate < minAllowedDate) startDate = minAllowedDate;
    if (endDate < minAllowedDate) endDate = minAllowedDate;
    if (startDate > endDate) startDate = endDate;

    const dateList = this.generateDateRange(startDate, endDate);

    // Demande utilisateur : pas de données d'exemple ou de faux collaborateurs dans les pointages.
    // Retourne une vue vide et propre sans informations fictives.
    const summary = {
      totalEmployees: 0,
      employeesWithMissingDays: 0,
      employeesFullyCompliant: 0,
      totalMissingDays: 0,
      totalIncompleteDays: 0,
      totalRecordedHours: 0,
      totalExpectedHours: 0,
      overallComplianceRate: 100,
      businessDaysCount: dateList.filter(d => !d.isWeekend).length,
      dateList
    };

    return {
      records: [],
      totalCount: 0,
      summary,
      fromCache: false,
      executionTimeMs: 1,
      startDate,
      endDate,
      thresholdHours,
      hideWeekends
    };
  }

  // --------------------------------------------------------------------------
  // Specialized Report: Vérification du Poids des Articles (Moules Neufs)
  // RÈGLES :
  // 1. Commandes de Vente (SO) non encore entièrement facturées (invoice_status != 'invoiced', state in ['sale', 'done'])
  // 2. Commandes possédant l'étiquette / tag "Moule neuf" (ou "moule neuf")
  // 3. Inspection de l'attribut Poids (weight) de chaque article dans les lignes de commande
  //    - Si Poids == 0 kg (ou non renseigné) => ANOMALIE (Rouge), "Poids manquant (0 kg)"
  //    - Si Poids > 0 kg => CONFORME (Vert), "Poids renseigné (X kg)"
  // --------------------------------------------------------------------------
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

    // 1. Authenticate to get UID
    const authRes = await this.testConnection(creds);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || 'Échec de connexion au serveur Odoo.');
    }
    const uid = authRes.uid;
    const baseUrl = (creds.url || '').replace(/\/+$/, '');

    // 2. Introspect sale.order available fields
    const saleFieldDefs = await this.getModelFields(creds, uid, 'sale.order');
    const existingSaleFields = new Set(Object.keys(saleFieldDefs));

    const candidateFields = [
      'id',
      'name',
      'partner_id',
      'date_order',
      'state',
      'invoice_status',
      'tag_ids',
      'order_line',
      'client_order_ref'
    ];
    const safeSaleFields = candidateFields.filter(f => existingSaleFields.has(f) || f === 'id' || f === 'name');

    // 3. Query confirmed uninvoiced sale orders
    // Criteria: state in ('sale', 'done') AND invoice_status != 'invoiced'
    const saleDomain: any[] = [
      ['state', 'in', ['sale', 'done']]
    ];
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
        {
          fields: safeSaleFields,
          order: 'date_order desc',
          limit: 300
        }
      );
    } catch (err: any) {
      console.warn('Fallback querying sale.order for mould report without invoice_status:', err);
      saleOrders = await this.executeKw(
        creds,
        uid,
        'sale.order',
        'search_read',
        [[['state', 'in', ['sale', 'done']]]],
        {
          fields: ['id', 'name', 'partner_id', 'date_order', 'state', 'order_line'],
          order: 'date_order desc',
          limit: 300
        }
      );
    }

    if (!Array.isArray(saleOrders) || saleOrders.length === 0) {
      const emptyResult = {
        records: [],
        totalCount: 0,
        summary: {
          totalOrdersCount: 0,
          totalProductsCount: 0,
          anomaliesCount: 0,
          compliantCount: 0,
          complianceRate: 100
        },
        fromCache: false,
        executionTimeMs: Date.now() - startTime
      };
      this.setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    // 4. Resolve Tags (crm.tag / sale.order.tag) to identify "Moule neuf" orders
    const allTagIds: number[] = [];
    for (const so of saleOrders) {
      if (Array.isArray(so.tag_ids)) {
        for (const t of so.tag_ids) {
          if (typeof t === 'number') {
            allTagIds.push(t);
          } else if (Array.isArray(t) && typeof t[0] === 'number') {
            allTagIds.push(t[0]);
          }
        }
      }
    }

    const tagMap = new Map<number, string>();
    if (allTagIds.length > 0) {
      const uniqueTagIds = Array.from(new Set(allTagIds));
      try {
        const tagRecords = await this.executeKw(
          creds,
          uid,
          'crm.tag',
          'read',
          [uniqueTagIds],
          { fields: ['id', 'name'] }
        );
        if (Array.isArray(tagRecords)) {
          for (const t of tagRecords) {
            tagMap.set(t.id, t.name || '');
          }
        }
      } catch (eTag) {
        try {
          const tagRecords = await this.executeKw(
            creds,
            uid,
            'sale.order.tag',
            'read',
            [uniqueTagIds],
            { fields: ['id', 'name'] }
          );
          if (Array.isArray(tagRecords)) {
            for (const t of tagRecords) {
              tagMap.set(t.id, t.name || '');
            }
          }
        } catch (eTag2) {
          console.warn('Could not read tags from crm.tag or sale.order.tag:', eTag2);
        }
      }
    }

    // Filter sale orders matching tag "Moule neuf" (case-insensitive: "moule neuf", "MOULE NEUF")
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

      // Check if tag names contain 'moule neuf'
      const hasMouldTag = names.some(n => {
        const clean = n.toLowerCase().trim();
        return clean.includes('moule neuf') || clean.includes('moules neufs');
      });

      if (hasMouldTag) {
        matchedOrders.push(so);
      }
    }

    if (matchedOrders.length === 0) {
      const emptyResult = {
        records: [],
        totalCount: 0,
        summary: {
          totalOrdersCount: 0,
          totalProductsCount: 0,
          anomaliesCount: 0,
          compliantCount: 0,
          complianceRate: 100
        },
        fromCache: false,
        executionTimeMs: Date.now() - startTime
      };
      this.setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    // 5. Query sale.order.line for matching orders
    const matchedOrderIds = matchedOrders.map(o => o.id);
    let orderLines: any[] = [];
    try {
      orderLines = await this.executeKw(
        creds,
        uid,
        'sale.order.line',
        'search_read',
        [[
          ['order_id', 'in', matchedOrderIds],
          ['product_id', '!=', false]
        ]],
        {
          fields: ['id', 'order_id', 'product_id', 'name', 'product_uom_qty', 'price_unit', 'price_subtotal'],
          limit: 1000
        }
      );
    } catch (eLines: any) {
      console.error('Error fetching sale.order.line for mould check:', eLines);
      throw new Error(`Erreur lors de la lecture des lignes de commande : ${eLines.message}`);
    }

    if (!Array.isArray(orderLines) || orderLines.length === 0) {
      const emptyResult = {
        records: [],
        totalCount: 0,
        summary: {
          totalOrdersCount: matchedOrders.length,
          totalProductsCount: 0,
          anomaliesCount: 0,
          compliantCount: 0,
          complianceRate: 100
        },
        fromCache: false,
        executionTimeMs: Date.now() - startTime
      };
      this.setCache(cacheKey, emptyResult);
      return emptyResult;
    }

    // 6. Query product.product to inspect weight attribute
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
          {
            fields: ['id', 'name', 'default_code', 'weight', 'product_tmpl_id', 'type']
          }
        );
        if (Array.isArray(products)) {
          for (const p of products) {
            productMap.set(p.id, p);
          }
        }
      } catch (eProd: any) {
        console.warn('Failed reading product.product with weight, retrying fallback:', eProd);
        try {
          const products = await this.executeKw(
            creds,
            uid,
            'product.product',
            'read',
            [productIds],
            {
              fields: ['id', 'name', 'default_code', 'product_tmpl_id']
            }
          );
          if (Array.isArray(products)) {
            for (const p of products) {
              productMap.set(p.id, p);
            }
          }
        } catch (eProd2) {
          console.error('Failed reading product.product fallback:', eProd2);
        }
      }
    }

    // Order lookup map
    const orderMap = new Map<number, any>();
    for (const o of matchedOrders) {
      orderMap.set(o.id, o);
    }

    // 7. Assemble records
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

      // Inspect weight
      const rawWeight = product.weight;
      const weightNum = (rawWeight !== undefined && rawWeight !== null && !isNaN(Number(rawWeight)))
        ? Math.max(0, Number(rawWeight))
        : 0;

      const hasWeight = weightNum > 0;
      const status = hasWeight ? 'CONFORME' : 'ANOMALIE';

      // Format weight: e.g. 1250 kg or 12.5 kg
      const formattedWeight = weightNum % 1 === 0 ? weightNum.toString() : weightNum.toFixed(2).replace(/\.?0+$/, '');
      const statusLabel = hasWeight 
        ? `Poids renseigné (${formattedWeight} kg)`
        : 'Poids manquant (0 kg)';

      const partnerName = Array.isArray(order.partner_id) ? order.partner_id[1] : (order.partner_id || 'Client inconnu');
      const partnerId = Array.isArray(order.partner_id) ? order.partner_id[0] : 0;
      const tagNames = orderTagNamesMap.get(order.id) || ['Moule neuf'];

      // Direct Odoo URLs
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

    // 8. Compute Summary
    const uniqueOrders = new Set(records.map(r => r.orderId));
    const anomaliesCount = records.filter(r => r.status === 'ANOMALIE').length;
    const compliantCount = records.filter(r => r.status === 'CONFORME').length;
    const totalProductsCount = records.length;
    const complianceRate = totalProductsCount > 0 
      ? Math.round((compliantCount / totalProductsCount) * 100)
      : 100;

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

  /**
   * Bilan de la facturation des ventes et des achats (par mois et par dossier)
   */
  public async getBillingReport(
    credentials: OdooConnectionCredentials,
    forceRefresh: boolean = false
  ): Promise<BillingReportResponse> {
    const cacheKey = this.getCacheKey('report:billing-summary', {
      db: credentials.db,
      url: credentials.url
    });

    if (!forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          fromCache: true
        };
      }
    }

    const startTime = Date.now();
    const authRes = await this.testConnection(credentials);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || 'Authentification Odoo impossible pour le bilan de facturation.');
    }
    const uid = authRes.uid;
    const cleanUrl = this.sanitizeUrl(credentials.url);

    // Fetch posted customer invoices, customer credit notes, vendor bills, vendor refunds
    const moves = await this.executeKw(
      credentials,
      uid,
      'account.move',
      'search_read',
      [
        [
          ['state', '=', 'posted'],
          ['move_type', 'in', ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']]
        ]
      ],
      {
        fields: [
          'id',
          'name',
          'ref',
          'invoice_origin',
          'partner_id',
          'invoice_date',
          'invoice_date_due',
          'move_type',
          'amount_untaxed',
          'amount_tax',
          'amount_total',
          'amount_residual',
          'state',
          'payment_state',
          'invoice_user_id',
          'invoice_line_ids'
        ],
        order: 'invoice_date desc, id desc',
        limit: 1000
      }
    );

    const MONTH_NAMES_FR = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const dossiers: InvoicedDossierItem[] = (moves || []).map((m: any) => {
      const isSale = m.move_type === 'out_invoice' || m.move_type === 'out_refund';
      const isRefund = m.move_type === 'out_refund' || m.move_type === 'in_refund';
      const sign = isRefund ? -1 : 1;

      const partnerName = Array.isArray(m.partner_id) ? m.partner_id[1] : (m.partner_id || 'Client / Fournisseur non renseigné');
      const partnerId = Array.isArray(m.partner_id) ? m.partner_id[0] : (typeof m.partner_id === 'number' ? m.partner_id : 0);
      const invoiceDate = m.invoice_date || new Date().toISOString().slice(0, 10);
      const monthKey = invoiceDate.slice(0, 7); // 'YYYY-MM'

      const dossierRef = m.invoice_origin || m.ref || m.name || `Dossier ${m.id}`;

      return {
        id: m.id,
        moveType: m.move_type,
        category: isSale ? 'sale' : 'purchase',
        name: m.name || `Pièce #${m.id}`,
        dossierRef,
        clientOrderRef: m.ref || undefined,
        partnerId,
        partnerName,
        invoiceDate,
        dueDate: m.invoice_date_due || undefined,
        monthKey,
        amountUntaxed: (Number(m.amount_untaxed) || 0) * sign,
        amountTax: (Number(m.amount_tax) || 0) * sign,
        amountTotal: (Number(m.amount_total) || 0) * sign,
        state: m.state || 'posted',
        paymentState: m.payment_state || 'not_paid',
        commercialUser: Array.isArray(m.invoice_user_id) ? m.invoice_user_id[1] : undefined,
        odooInvoiceUrl: `${cleanUrl}/web#id=${m.id}&model=account.move&view_type=form`,
        odooOrderUrl: m.invoice_origin ? `${cleanUrl}/web#view_type=form&model=${isSale ? 'sale.order' : 'purchase.order'}` : undefined,
        lineCount: Array.isArray(m.invoice_line_ids) ? m.invoice_line_ids.length : 0
      };
    });

    // Group by monthKey
    const monthGroups = new Map<string, InvoicedDossierItem[]>();
    for (const d of dossiers) {
      if (!d.monthKey || d.monthKey.length < 7) continue;
      const list = monthGroups.get(d.monthKey) || [];
      list.push(d);
      monthGroups.set(d.monthKey, list);
    }

    const sortedMonthKeys = Array.from(monthGroups.keys()).sort((a, b) => a.localeCompare(b)); // chronological
    const monthlySummaries: MonthlyBillingSummaryItem[] = sortedMonthKeys.map(key => {
      const items = monthGroups.get(key) || [];
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr, 10);
      const monthNum = parseInt(monthStr, 10);
      const monthName = MONTH_NAMES_FR[monthNum - 1] || key;

      const salesItems = items.filter(i => i.category === 'sale');
      const purchaseItems = items.filter(i => i.category === 'purchase');

      const salesUntaxed = Math.round(salesItems.reduce((acc, i) => acc + i.amountUntaxed, 0) * 100) / 100;
      const salesTotal = Math.round(salesItems.reduce((acc, i) => acc + i.amountTotal, 0) * 100) / 100;
      const salesCount = salesItems.length;
      const uniqueSalesDossiers = new Set(salesItems.map(i => i.dossierRef).filter(Boolean));

      const purchasesUntaxed = Math.round(purchaseItems.reduce((acc, i) => acc + i.amountUntaxed, 0) * 100) / 100;
      const purchasesTotal = Math.round(purchaseItems.reduce((acc, i) => acc + i.amountTotal, 0) * 100) / 100;
      const purchasesCount = purchaseItems.length;
      const uniquePurchaseDossiers = new Set(purchaseItems.map(i => i.dossierRef).filter(Boolean));

      const netMarginUntaxed = Math.round((salesUntaxed - purchasesUntaxed) * 100) / 100;
      const marginRate = salesUntaxed > 0 ? Math.round((netMarginUntaxed / salesUntaxed) * 1000) / 10 : 0;

      return {
        monthKey: key,
        monthLabel: `${monthName} ${year}`,
        shortLabel: `${monthName.slice(0, 4)}. ${String(year).slice(2)}`,
        year,
        month: monthNum,
        salesUntaxed,
        salesTotal,
        salesCount,
        salesDossiersCount: uniqueSalesDossiers.size || salesCount,
        purchasesUntaxed,
        purchasesTotal,
        purchasesCount,
        purchasesDossiersCount: uniquePurchaseDossiers.size || purchasesCount,
        netMarginUntaxed,
        marginRate
      };
    });

    const totalSalesUntaxed = Math.round(monthlySummaries.reduce((acc, m) => acc + m.salesUntaxed, 0) * 100) / 100;
    const totalSalesTotal = Math.round(monthlySummaries.reduce((acc, m) => acc + m.salesTotal, 0) * 100) / 100;
    const totalPurchasesUntaxed = Math.round(monthlySummaries.reduce((acc, m) => acc + m.purchasesUntaxed, 0) * 100) / 100;
    const totalPurchasesTotal = Math.round(monthlySummaries.reduce((acc, m) => acc + m.purchasesTotal, 0) * 100) / 100;
    const totalNetMarginUntaxed = Math.round((totalSalesUntaxed - totalPurchasesUntaxed) * 100) / 100;
    const overallMarginRate = totalSalesUntaxed > 0 ? Math.round((totalNetMarginUntaxed / totalSalesUntaxed) * 1000) / 10 : 0;
    const totalSalesInvoicesCount = monthlySummaries.reduce((acc, m) => acc + m.salesCount, 0);
    const totalPurchasesBillsCount = monthlySummaries.reduce((acc, m) => acc + m.purchasesCount, 0);
    const totalDossiersCount = dossiers.length;

    const summary: BillingReportSummary = {
      totalSalesUntaxed,
      totalSalesTotal,
      totalPurchasesUntaxed,
      totalPurchasesTotal,
      totalNetMarginUntaxed,
      overallMarginRate,
      totalSalesInvoicesCount,
      totalPurchasesBillsCount,
      totalDossiersCount
    };

    const response: BillingReportResponse = {
      success: true,
      monthlySummaries,
      dossiers,
      summary,
      fromCache: false,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      isDemo: false
    };

    this.setCache(cacheKey, response);
    return response;
  }

  public getMockBillingReport(): BillingReportResponse {
    const monthlySummaries: MonthlyBillingSummaryItem[] = [
      {
        monthKey: '2026-01',
        monthLabel: 'Janvier 2026',
        shortLabel: 'Janv. 26',
        year: 2026,
        month: 1,
        salesUntaxed: 118500,
        salesTotal: 142200,
        salesCount: 8,
        salesDossiersCount: 7,
        purchasesUntaxed: 48200,
        purchasesTotal: 57840,
        purchasesCount: 9,
        purchasesDossiersCount: 8,
        netMarginUntaxed: 70300,
        marginRate: 59.3
      },
      {
        monthKey: '2026-02',
        monthLabel: 'Février 2026',
        shortLabel: 'Févr. 26',
        year: 2026,
        month: 2,
        salesUntaxed: 142000,
        salesTotal: 170400,
        salesCount: 11,
        salesDossiersCount: 10,
        purchasesUntaxed: 59400,
        purchasesTotal: 71280,
        purchasesCount: 12,
        purchasesDossiersCount: 11,
        netMarginUntaxed: 82600,
        marginRate: 58.2
      },
      {
        monthKey: '2026-03',
        monthLabel: 'Mars 2026',
        shortLabel: 'Mars 26',
        year: 2026,
        month: 3,
        salesUntaxed: 165800,
        salesTotal: 198960,
        salesCount: 14,
        salesDossiersCount: 13,
        purchasesUntaxed: 71200,
        purchasesTotal: 85440,
        purchasesCount: 14,
        purchasesDossiersCount: 12,
        netMarginUntaxed: 94600,
        marginRate: 57.1
      },
      {
        monthKey: '2026-04',
        monthLabel: 'Avril 2026',
        shortLabel: 'Avr. 26',
        year: 2026,
        month: 4,
        salesUntaxed: 134200,
        salesTotal: 161040,
        salesCount: 10,
        salesDossiersCount: 9,
        purchasesUntaxed: 52600,
        purchasesTotal: 63120,
        purchasesCount: 11,
        purchasesDossiersCount: 10,
        netMarginUntaxed: 81600,
        marginRate: 60.8
      },
      {
        monthKey: '2026-05',
        monthLabel: 'Mai 2026',
        shortLabel: 'Mai 26',
        year: 2026,
        month: 5,
        salesUntaxed: 188400,
        salesTotal: 226080,
        salesCount: 16,
        salesDossiersCount: 15,
        purchasesUntaxed: 79800,
        purchasesTotal: 95760,
        purchasesCount: 15,
        purchasesDossiersCount: 14,
        netMarginUntaxed: 108600,
        marginRate: 57.6
      },
      {
        monthKey: '2026-06',
        monthLabel: 'Juin 2026',
        shortLabel: 'Juin 26',
        year: 2026,
        month: 6,
        salesUntaxed: 210500,
        salesTotal: 252600,
        salesCount: 18,
        salesDossiersCount: 16,
        purchasesUntaxed: 88300,
        purchasesTotal: 105960,
        purchasesCount: 17,
        purchasesDossiersCount: 15,
        netMarginUntaxed: 122200,
        marginRate: 58.1
      },
      {
        monthKey: '2026-07',
        monthLabel: 'Juillet 2026',
        shortLabel: 'Juil. 26',
        year: 2026,
        month: 7,
        salesUntaxed: 175000,
        salesTotal: 210000,
        salesCount: 13,
        salesDossiersCount: 12,
        purchasesUntaxed: 74100,
        purchasesTotal: 88920,
        purchasesCount: 13,
        purchasesDossiersCount: 12,
        netMarginUntaxed: 100900,
        marginRate: 57.7
      },
      {
        monthKey: '2026-08',
        monthLabel: 'Août 2026',
        shortLabel: 'Août 26',
        year: 2026,
        month: 8,
        salesUntaxed: 194600,
        salesTotal: 233520,
        salesCount: 15,
        salesDossiersCount: 14,
        purchasesUntaxed: 82450,
        purchasesTotal: 98940,
        purchasesCount: 16,
        purchasesDossiersCount: 14,
        netMarginUntaxed: 112150,
        marginRate: 57.6
      },
      {
        monthKey: '2026-09',
        monthLabel: 'Septembre 2026',
        shortLabel: 'Sept. 26',
        year: 2026,
        month: 9,
        salesUntaxed: 226800,
        salesTotal: 272160,
        salesCount: 19,
        salesDossiersCount: 17,
        purchasesUntaxed: 91500,
        purchasesTotal: 109800,
        purchasesCount: 18,
        purchasesDossiersCount: 16,
        netMarginUntaxed: 135300,
        marginRate: 59.7
      }
    ];

    const dossiers: InvoicedDossierItem[] = [
      // Septembre 2026
      {
        id: 215,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00115',
        dossierRef: 'SO/2026/00145',
        clientOrderRef: 'PO-AUTO-778',
        partnerId: 88,
        partnerName: 'Novatech Industrie (Lille)',
        invoiceDate: '2026-09-22',
        dueDate: '2026-10-22',
        monthKey: '2026-09',
        amountUntaxed: 48500.00,
        amountTax: 9700.00,
        amountTotal: 58200.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=215&model=account.move&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=115&model=sale.order&view_type=form',
        lineCount: 4
      },
      {
        id: 216,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00114',
        dossierRef: 'SO/2026/00144',
        clientOrderRef: 'CH-ALPHA-02',
        partnerId: 45,
        partnerName: 'Cabinet Alpha Conseil (Genève)',
        invoiceDate: '2026-09-18',
        dueDate: '2026-10-18',
        monthKey: '2026-09',
        amountUntaxed: 38200.00,
        amountTax: 0.00,
        amountTotal: 38200.00,
        state: 'posted',
        paymentState: 'partial',
        commercialUser: 'Sophie Vendeuse',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=216&model=account.move&view_type=form',
        lineCount: 2
      },
      {
        id: 217,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00062',
        dossierRef: 'PO/2026/00068',
        partnerId: 60,
        partnerName: 'Matières Premières & Bois SA (Strasbourg)',
        invoiceDate: '2026-09-15',
        dueDate: '2026-10-15',
        monthKey: '2026-09',
        amountUntaxed: 24800.00,
        amountTax: 4960.00,
        amountTotal: 29760.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=217&model=account.move&view_type=form',
        lineCount: 6
      },
      {
        id: 218,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00113',
        dossierRef: 'SO/2026/00143',
        clientOrderRef: 'DECO-BATCH-03',
        partnerId: 12,
        partnerName: 'Deco Addict SAS (Lyon)',
        invoiceDate: '2026-09-11',
        dueDate: '2026-10-11',
        monthKey: '2026-09',
        amountUntaxed: 65400.00,
        amountTax: 13080.00,
        amountTotal: 78480.00,
        state: 'posted',
        paymentState: 'not_paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=218&model=account.move&view_type=form',
        lineCount: 5
      },
      {
        id: 219,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00061',
        dossierRef: 'PO/2026/00067',
        partnerId: 65,
        partnerName: 'Électronique Pro Components (Grenoble)',
        invoiceDate: '2026-09-08',
        dueDate: '2026-10-08',
        monthKey: '2026-09',
        amountUntaxed: 31200.00,
        amountTax: 6240.00,
        amountTotal: 37440.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=219&model=account.move&view_type=form',
        lineCount: 8
      },
      {
        id: 220,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00112',
        dossierRef: 'SO/2026/00142',
        clientOrderRef: 'PO-DECO-998',
        partnerId: 12,
        partnerName: 'Deco Addict SAS (Lyon)',
        invoiceDate: '2026-09-04',
        dueDate: '2026-10-04',
        monthKey: '2026-09',
        amountUntaxed: 74700.00,
        amountTax: 14940.00,
        amountTotal: 89640.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=220&model=account.move&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=101&model=sale.order&view_type=form',
        lineCount: 7
      },
      {
        id: 221,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00060',
        dossierRef: 'PO/2026/00066',
        partnerId: 52,
        partnerName: 'Fournisseur Global Logistics (Le Havre)',
        invoiceDate: '2026-09-02',
        dueDate: '2026-10-02',
        monthKey: '2026-09',
        amountUntaxed: 35500.00,
        amountTax: 7100.00,
        amountTotal: 42600.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=221&model=account.move&view_type=form',
        lineCount: 3
      },

      // Août 2026
      {
        id: 201,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00098',
        dossierRef: 'SO/2026/00141',
        clientOrderRef: 'AZ-2026-08',
        partnerId: 24,
        partnerName: 'Azure Interior SARL (Paris)',
        invoiceDate: '2026-08-21',
        dueDate: '2026-09-20',
        monthKey: '2026-08',
        amountUntaxed: 8400.00,
        amountTax: 1680.00,
        amountTotal: 10080.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=201&model=account.move&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=102&model=sale.order&view_type=form',
        lineCount: 3
      },
      {
        id: 202,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00099',
        dossierRef: 'SO/2026/00138',
        clientOrderRef: 'ABM-994',
        partnerId: 9,
        partnerName: 'Atelier Bois & Métal (Bordeaux)',
        invoiceDate: '2026-08-19',
        dueDate: '2026-09-18',
        monthKey: '2026-08',
        amountUntaxed: 18900.00,
        amountTax: 3780.00,
        amountTotal: 22680.00,
        state: 'posted',
        paymentState: 'not_paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=202&model=account.move&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=105&model=sale.order&view_type=form',
        lineCount: 4
      },
      {
        id: 203,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00100',
        dossierRef: 'SO/2026/00137',
        clientOrderRef: 'CH-ALPHA-01',
        partnerId: 45,
        partnerName: 'Cabinet Alpha Conseil (Genève)',
        invoiceDate: '2026-08-17',
        dueDate: '2026-09-16',
        monthKey: '2026-08',
        amountUntaxed: 34500.00,
        amountTax: 0.00,
        amountTotal: 34500.00,
        state: 'posted',
        paymentState: 'partial',
        commercialUser: 'Sophie Vendeuse',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=203&model=account.move&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=106&model=sale.order&view_type=form',
        lineCount: 2
      },
      {
        id: 204,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00045',
        dossierRef: 'PO/2026/00055',
        clientOrderRef: 'GL-FR-993',
        partnerId: 52,
        partnerName: 'Fournisseur Global Logistics (Le Havre)',
        invoiceDate: '2026-08-16',
        dueDate: '2026-09-15',
        monthKey: '2026-08',
        amountUntaxed: 4200.00,
        amountTax: 840.00,
        amountTotal: 5040.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=204&model=account.move&view_type=form',
        lineCount: 2
      },
      {
        id: 205,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00101',
        dossierRef: 'SO/2026/00135',
        clientOrderRef: 'ECO-26-44',
        partnerId: 22,
        partnerName: 'EcoBat Construction Durable (Toulouse)',
        invoiceDate: '2026-08-14',
        dueDate: '2026-09-13',
        monthKey: '2026-08',
        amountUntaxed: 62800.00,
        amountTax: 12560.00,
        amountTotal: 75360.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Sophie Vendeuse',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=205&model=account.move&view_type=form',
        odooOrderUrl: 'https://demo.odoo.com/web#id=108&model=sale.order&view_type=form',
        lineCount: 5
      },
      {
        id: 206,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00046',
        dossierRef: 'PO/2026/00054',
        clientOrderRef: 'MPB-2026-14',
        partnerId: 60,
        partnerName: 'Matières Premières & Bois SA (Strasbourg)',
        invoiceDate: '2026-08-12',
        dueDate: '2026-09-11',
        monthKey: '2026-08',
        amountUntaxed: 38250.00,
        amountTax: 7650.00,
        amountTotal: 45900.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=206&model=account.move&view_type=form',
        lineCount: 4
      },
      {
        id: 207,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00102',
        dossierRef: 'SO042',
        clientOrderRef: 'PO-XYZ-2026-08',
        partnerId: 99,
        partnerName: 'Client XYZ (Paris)',
        invoiceDate: '2026-08-08',
        dueDate: '2026-09-07',
        monthKey: '2026-08',
        amountUntaxed: 70000.00,
        amountTax: 14000.00,
        amountTotal: 84000.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=207&model=account.move&view_type=form',
        lineCount: 6
      },
      {
        id: 208,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00047',
        dossierRef: 'PO/2026/00052',
        partnerId: 65,
        partnerName: 'Électronique Pro Components (Grenoble)',
        invoiceDate: '2026-08-05',
        dueDate: '2026-09-04',
        monthKey: '2026-08',
        amountUntaxed: 40000.00,
        amountTax: 8000.00,
        amountTotal: 48000.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=208&model=account.move&view_type=form',
        lineCount: 3
      },

      // Juillet 2026
      {
        id: 191,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00085',
        dossierRef: 'SO/2026/00125',
        clientOrderRef: 'LUM-DEVIS-04',
        partnerId: 31,
        partnerName: 'Lumina Design Studio (Bruxelles)',
        invoiceDate: '2026-07-28',
        dueDate: '2026-08-27',
        monthKey: '2026-07',
        amountUntaxed: 52000.00,
        amountTax: 10400.00,
        amountTotal: 62400.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Sophie Vendeuse',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=191&model=account.move&view_type=form',
        lineCount: 4
      },
      {
        id: 192,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00086',
        dossierRef: 'SO/2026/00126',
        partnerId: 18,
        partnerName: 'Gemini Tech Solutions (Nantes)',
        invoiceDate: '2026-07-16',
        dueDate: '2026-08-15',
        monthKey: '2026-07',
        amountUntaxed: 78000.00,
        amountTax: 15600.00,
        amountTotal: 93600.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Sophie Vendeuse',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=192&model=account.move&view_type=form',
        lineCount: 6
      },
      {
        id: 193,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00038',
        dossierRef: 'PO/2026/00045',
        partnerId: 60,
        partnerName: 'Matières Premières & Bois SA (Strasbourg)',
        invoiceDate: '2026-07-12',
        dueDate: '2026-08-11',
        monthKey: '2026-07',
        amountUntaxed: 45100.00,
        amountTax: 9020.00,
        amountTotal: 54120.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=193&model=account.move&view_type=form',
        lineCount: 5
      },
      {
        id: 194,
        moveType: 'out_invoice',
        category: 'sale',
        name: 'INV/2026/00087',
        dossierRef: 'SO/2026/00127',
        partnerId: 14,
        partnerName: 'Grand Hôtel Riviera (Nice)',
        invoiceDate: '2026-07-05',
        dueDate: '2026-08-04',
        monthKey: '2026-07',
        amountUntaxed: 45000.00,
        amountTax: 9000.00,
        amountTotal: 54000.00,
        state: 'posted',
        paymentState: 'paid',
        commercialUser: 'Marc Demo',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=194&model=account.move&view_type=form',
        lineCount: 3
      },
      {
        id: 195,
        moveType: 'in_invoice',
        category: 'purchase',
        name: 'BILL/2026/00039',
        dossierRef: 'PO/2026/00046',
        partnerId: 52,
        partnerName: 'Fournisseur Global Logistics (Le Havre)',
        invoiceDate: '2026-07-02',
        dueDate: '2026-08-01',
        monthKey: '2026-07',
        amountUntaxed: 29000.00,
        amountTax: 5800.00,
        amountTotal: 34800.00,
        state: 'posted',
        paymentState: 'paid',
        odooInvoiceUrl: 'https://demo.odoo.com/web#id=195&model=account.move&view_type=form',
        lineCount: 2
      }
    ];

    const totalSalesUntaxed = Math.round(monthlySummaries.reduce((acc, m) => acc + m.salesUntaxed, 0) * 100) / 100;
    const totalSalesTotal = Math.round(monthlySummaries.reduce((acc, m) => acc + m.salesTotal, 0) * 100) / 100;
    const totalPurchasesUntaxed = Math.round(monthlySummaries.reduce((acc, m) => acc + m.purchasesUntaxed, 0) * 100) / 100;
    const totalPurchasesTotal = Math.round(monthlySummaries.reduce((acc, m) => acc + m.purchasesTotal, 0) * 100) / 100;
    const totalNetMarginUntaxed = Math.round((totalSalesUntaxed - totalPurchasesUntaxed) * 100) / 100;
    const overallMarginRate = totalSalesUntaxed > 0 ? Math.round((totalNetMarginUntaxed / totalSalesUntaxed) * 1000) / 10 : 0;
    const totalSalesInvoicesCount = monthlySummaries.reduce((acc, m) => acc + m.salesCount, 0);
    const totalPurchasesBillsCount = monthlySummaries.reduce((acc, m) => acc + m.purchasesCount, 0);
    const totalDossiersCount = dossiers.length;

    return {
      success: true,
      monthlySummaries,
      dossiers,
      summary: {
        totalSalesUntaxed,
        totalSalesTotal,
        totalPurchasesUntaxed,
        totalPurchasesTotal,
        totalNetMarginUntaxed,
        overallMarginRate,
        totalSalesInvoicesCount,
        totalPurchasesBillsCount,
        totalDossiersCount
      },
      fromCache: false,
      executionTimeMs: 16,
      timestamp: new Date().toISOString(),
      isDemo: true
    };
  }

  // --------------------------------------------------------------------------
  // Specialized Report: Sorties d'Encours Achats (Achats des Ventes Facturées)
  // SPÉCIFICATIONS :
  // 1. Récupère les Factures Clients (account.move 'out_invoice' / 'out_refund') validées ('posted') pour le mois sélectionné.
  // 2. Identifie les Commandes de Ventes (sale.order) et leurs Comptes Analytiques (analytic_account_id).
  // 3. Extrait pour ces comptes toutes les lignes d'achats fournisseurs (factures in_invoice, bons de commande purchase.order, écritures de coût).
  // 4. Calcule le Total des Achats qui sortent de l'encours sur le mois, la marge brute et le détail par pièce fournisseur.
  // --------------------------------------------------------------------------
  public async getWipPurchasesOutflowReport(
    credentials: OdooConnectionCredentials,
    options: {
      monthKey?: string;
      forceRefresh?: boolean;
    } = {}
  ): Promise<WipOutflowReportResponse> {
    const startTime = Date.now();
    const cleanUrl = this.sanitizeUrl(credentials.url);

    const cacheKey = this.getCacheKey(`report:wip-outflow:${options.monthKey || 'auto'}`, {
      db: credentials.db,
      url: credentials.url
    });

    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    const authRes = await this.testConnection(credentials);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || "Authentification Odoo impossible pour le rapport de sortie d'encours.");
    }
    const uid = authRes.uid;

    const MONTH_NAMES_FR = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    // 1. Récupérer toutes les factures clients validées (pour dresser la liste des mois disponibles)
    const allPostedInvoices = await this.executeKw(
      credentials,
      uid,
      'account.move',
      'search_read',
      [
        [
          ['state', '=', 'posted'],
          ['move_type', 'in', ['out_invoice', 'out_refund']]
        ]
      ],
      {
        fields: [
          'id',
          'name',
          'ref',
          'invoice_origin',
          'partner_id',
          'invoice_date',
          'move_type',
          'amount_untaxed',
          'amount_total',
          'invoice_user_id',
          'invoice_line_ids'
        ],
        order: 'invoice_date desc, id desc',
        limit: 1500
      }
    );

    // Dénombrer et agréger les mois disponibles
    const monthMap = new Map<string, { count: number; sales: number }>();
    (allPostedInvoices || []).forEach((inv: any) => {
      const dateStr = inv.invoice_date || '';
      if (dateStr.length >= 7) {
        const mKey = dateStr.slice(0, 7);
        const sign = inv.move_type === 'out_refund' ? -1 : 1;
        const current = monthMap.get(mKey) || { count: 0, sales: 0 };
        current.count += 1;
        current.sales += (Number(inv.amount_untaxed) || 0) * sign;
        monthMap.set(mKey, current);
      }
    });

    const sortedMonthKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));
    
    // Déterminer le mois sélectionné (par défaut : options.monthKey, ou le mois le plus récent)
    const selectedMonthKey = options.monthKey && options.monthKey.length === 7
      ? options.monthKey
      : (sortedMonthKeys[0] || new Date().toISOString().slice(0, 7));

    const selectedYear = parseInt(selectedMonthKey.slice(0, 4), 10);
    const selectedMonthNum = parseInt(selectedMonthKey.slice(5, 7), 10);
    const selectedMonthLabel = `${MONTH_NAMES_FR[selectedMonthNum - 1] || 'Mois'} ${selectedYear}`;

    // Filtrer les factures clients pour le mois sélectionné
    const targetInvoices = (allPostedInvoices || []).filter((inv: any) => {
      const d = inv.invoice_date || '';
      return d.startsWith(selectedMonthKey);
    });

    // 2. Introspection multi-modèles pour sécuriser les champs existants
    const [amlFieldDefs, soFieldDefs, projFieldDefs, poFieldDefs, polFieldDefs, aalFieldDefs, solFieldDefs] = await Promise.all([
      this.getModelFields(credentials, uid, 'account.move.line').catch(() => ({})),
      this.getModelFields(credentials, uid, 'sale.order').catch(() => ({})),
      this.getModelFields(credentials, uid, 'project.project').catch(() => ({})),
      this.getModelFields(credentials, uid, 'purchase.order').catch(() => ({})),
      this.getModelFields(credentials, uid, 'purchase.order.line').catch(() => ({})),
      this.getModelFields(credentials, uid, 'account.analytic.line').catch(() => ({})),
      this.getModelFields(credentials, uid, 'sale.order.line').catch(() => ({}))
    ]);

    const targetInvoiceIds: number[] = targetInvoices.map((inv: any) => inv.id);
    const targetPartnerIds = new Set<number>();
    const partnerNames = new Map<number, string>();
    targetInvoices.forEach((inv: any) => {
      if (inv.partner_id && Array.isArray(inv.partner_id) && typeof inv.partner_id[0] === 'number') {
        targetPartnerIds.add(inv.partner_id[0]);
        partnerNames.set(inv.partner_id[0], String(inv.partner_id[1] || ''));
      }
    });

    // =========================================================================
    // 2. IDENTIFICATION STRICTE DE LA COMMANDE ET DU COMPTE ANALYTIQUE UNIQUE
    // Règle d'or : Chaque facture client est rattachée à sa commande 'sale.order'
    // et à l'ID EXACT et UNIQUE de son compte analytique (sale_order.analytic_account_id.id).
    // AUCUNE pollution par partner_id, recherche textuelle ou comptes généraux de société.
    // =========================================================================

    // Extraire les références de commandes directes depuis les factures clientes
    const originSoNames = new Set<string>();
    targetInvoices.forEach((inv: any) => {
      if (inv.invoice_origin) {
        const o = String(inv.invoice_origin).trim();
        if (o) originSoNames.add(o);
        o.split(',').forEach(tok => {
          const t = tok.trim();
          if (t) originSoNames.add(t);
        });
      }
      if (inv.ref) {
        const r = String(inv.ref).trim();
        if (r) originSoNames.add(r);
      }
    });

    // 2.1 Remonter les sale_order_ids depuis les lignes de factures clientes (sale_line_ids)
    let saleLineIdsToSearch: number[] = [];
    if (targetInvoiceIds.length > 0) {
      try {
        const safeCustLineFields = ['id', 'move_id'];
        if ('sale_line_ids' in amlFieldDefs) safeCustLineFields.push('sale_line_ids');
        if ('analytic_account_id' in amlFieldDefs) safeCustLineFields.push('analytic_account_id');

        const custLines = await this.executeKw(
          credentials,
          uid,
          'account.move.line',
          'search_read',
          [[['move_id', 'in', targetInvoiceIds]]],
          { fields: safeCustLineFields, limit: 3000 }
        );

        if (Array.isArray(custLines)) {
          custLines.forEach((cl: any) => {
            if (Array.isArray(cl.sale_line_ids)) {
              cl.sale_line_ids.forEach((slId: number) => {
                if (typeof slId === 'number') saleLineIdsToSearch.push(slId);
              });
            }
          });
        }
      } catch (errLines) {
        console.warn('[WipOutflow] Erreur lecture lignes factures clientes:', errLines);
      }
    }

    const saleOrderIdsFromLines = new Set<number>();
    if (saleLineIdsToSearch.length > 0) {
      try {
        const solLines = await this.executeKw(
          credentials,
          uid,
          'sale.order.line',
          'search_read',
          [[['id', 'in', Array.from(new Set(saleLineIdsToSearch)).slice(0, 500)]]],
          { fields: ['id', 'order_id'], limit: 500 }
        );
        if (Array.isArray(solLines)) {
          solLines.forEach((sol: any) => {
            if (sol.order_id && Array.isArray(sol.order_id)) {
              saleOrderIdsFromLines.add(sol.order_id[0]);
              originSoNames.add(sol.order_id[1]);
            }
          });
        }
      } catch (errSol) {
        console.warn('[WipOutflow] Erreur recherche sale.order.line:', errSol);
      }
    }

    // 2.2 Rechercher les Commandes de Vente (sale.order)
    let linkedSaleOrders: any[] = [];
    try {
      const safeSoFields = ['id', 'name', 'partner_id', 'amount_untaxed', 'client_order_ref'];
      if ('analytic_account_id' in soFieldDefs) safeSoFields.push('analytic_account_id');
      if ('project_id' in soFieldDefs) safeSoFields.push('project_id');
      if ('project_account_id' in soFieldDefs) safeSoFields.push('project_account_id');
      if ('invoice_ids' in soFieldDefs) safeSoFields.push('invoice_ids');

      const soClauses: any[] = [];
      if (originSoNames.size > 0) {
        soClauses.push(['name', 'in', Array.from(originSoNames)]);
      }
      if (saleOrderIdsFromLines.size > 0) {
        soClauses.push(['id', 'in', Array.from(saleOrderIdsFromLines)]);
      }
      if ('invoice_ids' in soFieldDefs && targetInvoiceIds.length > 0) {
        soClauses.push(['invoice_ids', 'in', targetInvoiceIds]);
      }

      if (soClauses.length > 0) {
        const soDomain: any[] = [];
        if (soClauses.length === 1) soDomain.push(soClauses[0]);
        else if (soClauses.length === 2) soDomain.push('|', soClauses[0], soClauses[1]);
        else if (soClauses.length >= 3) soDomain.push('|', soClauses[0], '|', soClauses[1], soClauses[2]);

        linkedSaleOrders = await this.executeKw(
          credentials,
          uid,
          'sale.order',
          'search_read',
          [soDomain],
          { fields: safeSoFields, limit: 1000 }
        );
      }
    } catch (soErr) {
      console.warn('[WipOutflow] Erreur recherche sale.order:', soErr);
    }

    const orderByName = new Map<string, any>();
    const orderById = new Map<number, any>();
    (linkedSaleOrders || []).forEach((so: any) => {
      orderByName.set(so.name, so);
      orderById.set(so.id, so);
    });

    // 2.3 Rechercher project.project uniquement pour les projets rattachés aux commandes trouvées
    const projectIdsToFetch = new Set<number>();
    (linkedSaleOrders || []).forEach((so: any) => {
      if (so.project_id && Array.isArray(so.project_id) && typeof so.project_id[0] === 'number') {
        projectIdsToFetch.add(so.project_id[0]);
      }
    });

    const projectById = new Map<number, any>();
    if (projectIdsToFetch.size > 0) {
      try {
        const safeProjFields = ['id', 'name'];
        if ('analytic_account_id' in projFieldDefs) safeProjFields.push('analytic_account_id');
        if ('account_id' in projFieldDefs) safeProjFields.push('account_id');

        const projs = await this.executeKw(
          credentials,
          uid,
          'project.project',
          'search_read',
          [[['id', 'in', Array.from(projectIdsToFetch)]]],
          { fields: safeProjFields, limit: 500 }
        );
        if (Array.isArray(projs)) {
          projs.forEach((p: any) => projectById.set(p.id, p));
        }
      } catch (projErr) {
        console.warn('[WipOutflow] Erreur lecture project.project:', projErr);
      }
    }

    // 2.4 Associer à CHAQUE FACTURE CLIENT : SA COMMANDE ET SON COMPTE ANALYTIQUE STRICT
    const invoiceToLinkedSo = new Map<number, any>();
    const invoiceToStrictAnalyticId = new Map<number, number>();
    const invoiceToStrictAnalyticName = new Map<number, string>();
    const invoiceToProjectId = new Map<number, number>();
    const invoiceToProjectName = new Map<number, string>();

    targetInvoices.forEach((inv: any) => {
      let linkedSo: any = null;
      if (inv.invoice_origin) {
        const orig = String(inv.invoice_origin).trim();
        if (orderByName.has(orig)) {
          linkedSo = orderByName.get(orig);
        } else {
          for (const tok of orig.split(',')) {
            const t = tok.trim();
            if (orderByName.has(t)) {
              linkedSo = orderByName.get(t);
              break;
            }
          }
        }
      }
      if (!linkedSo && inv.ref && orderByName.has(String(inv.ref).trim())) {
        linkedSo = orderByName.get(String(inv.ref).trim());
      }
      if (!linkedSo) {
        for (const so of linkedSaleOrders) {
          if (Array.isArray(so.invoice_ids) && so.invoice_ids.includes(inv.id)) {
            linkedSo = so;
            break;
          }
        }
      }

      if (linkedSo) {
        invoiceToLinkedSo.set(inv.id, linkedSo);

        if (linkedSo.project_id && Array.isArray(linkedSo.project_id)) {
          const pId = linkedSo.project_id[0];
          invoiceToProjectId.set(inv.id, pId);
          invoiceToProjectName.set(inv.id, linkedSo.project_id[1]);
        }

        // 1. IDENTIFICATION STRICTE : sale_order.analytic_account_id.id
        if (linkedSo.analytic_account_id && Array.isArray(linkedSo.analytic_account_id) && typeof linkedSo.analytic_account_id[0] === 'number') {
          invoiceToStrictAnalyticId.set(inv.id, linkedSo.analytic_account_id[0]);
          invoiceToStrictAnalyticName.set(inv.id, linkedSo.analytic_account_id[1]);
        } else if (linkedSo.project_account_id && Array.isArray(linkedSo.project_account_id) && typeof linkedSo.project_account_id[0] === 'number') {
          invoiceToStrictAnalyticId.set(inv.id, linkedSo.project_account_id[0]);
          invoiceToStrictAnalyticName.set(inv.id, linkedSo.project_account_id[1]);
        } else if (linkedSo.project_id && Array.isArray(linkedSo.project_id)) {
          const proj = projectById.get(linkedSo.project_id[0]);
          if (proj?.analytic_account_id && Array.isArray(proj.analytic_account_id)) {
            invoiceToStrictAnalyticId.set(inv.id, proj.analytic_account_id[0]);
            invoiceToStrictAnalyticName.set(inv.id, proj.analytic_account_id[1]);
          } else if (proj?.account_id && Array.isArray(proj.account_id)) {
            invoiceToStrictAnalyticId.set(inv.id, proj.account_id[0]);
            invoiceToStrictAnalyticName.set(inv.id, proj.account_id[1]);
          }
        }
      }

      // Si pas de compte sur la commande, vérifier directement la facture client
      if (!invoiceToStrictAnalyticId.has(inv.id)) {
        if (inv.analytic_account_id && Array.isArray(inv.analytic_account_id) && typeof inv.analytic_account_id[0] === 'number') {
          invoiceToStrictAnalyticId.set(inv.id, inv.analytic_account_id[0]);
          invoiceToStrictAnalyticName.set(inv.id, inv.analytic_account_id[1]);
        }
      }
    });

    const monthLastDay = new Date(selectedYear, selectedMonthNum, 0).getDate();
    const asOfDate = `${selectedMonthKey}-${String(monthLastDay).padStart(2, '0')}`;

    // Ensemble des comptes analytiques STRICTS identifiés pour ce mois
    const allStrictAnalyticAccountIds = new Set<number>();
    invoiceToStrictAnalyticId.forEach(id => {
      if (typeof id === 'number') allStrictAnalyticAccountIds.add(id);
    });
    const strictAnalyticIdsList = Array.from(allStrictAnalyticAccountIds);

    // =========================================================================
    // 3. REQUÊTAGE STRICT ODOO DES ACHATS RATTACHÉS PAR COMPTE ANALYTIQUE
    // Règle 2 : Domaine STRICT [('account_id'/'analytic_account_id', 'in', strictAnalyticIdsList)]
    // NE PAS élargir au partner_id, NE PAS faire de recherche textuelle, NE PAS inclure NULL
    // =========================================================================

    // 3.1 Step A: Query Analytic Lines (account.analytic.line)
    // C'est le modèle maître utilisé par le tableau de bord Projet d'Odoo ("Autres coûts" / "Achats")
    let allAnalyticLines: any[] = [];
    const aalAccountField = ('account_id' in aalFieldDefs)
      ? 'account_id'
      : (('analytic_account_id' in aalFieldDefs) ? 'analytic_account_id' : 'account_id');

    if (strictAnalyticIdsList.length > 0) {
      try {
        const candidateAalFields = [
          'id', 'name', 'unit_amount', 'date', 'user_id', 'employee_id',
          'account_id', 'so_line', 'project_id', 'task_id', 'amount', 'move_line_id',
          'purchase_line_id', 'category', 'product_uom_id', 'partner_id', 'ref', 'product_id', 'general_account_id'
        ];
        const safeAalFields = Object.keys(aalFieldDefs).length > 0
          ? candidateAalFields.filter(f => f in aalFieldDefs || f === 'id')
          : ['id', 'name', 'unit_amount', 'date', 'account_id', 'amount', 'move_line_id', 'purchase_line_id', 'category'];

        const analyticDomain: any[] = [
          [aalAccountField, 'in', strictAnalyticIdsList]
        ];
        if (asOfDate && 'date' in aalFieldDefs) {
          analyticDomain.push(['date', '<=', asOfDate]);
        }

        allAnalyticLines = await this.executeKw(
          credentials,
          uid,
          'account.analytic.line',
          'search_read',
          [analyticDomain],
          { fields: safeAalFields, limit: 5000 }
        );
      } catch (aalErr) {
        console.warn('[WipOutflow] Erreur recherche account.analytic.line:', aalErr);
        allAnalyticLines = [];
      }
    }

    // 3.2 Step B: Query Vendor Bill Lines (account.move.line)
    // Factures fournisseurs validées ('parent_state' = 'posted', 'move_type' IN ('in_invoice', 'in_refund'))
    let allVendorBillLines: any[] = [];
    const seenGlobalPurchaseLineIds = new Set<number>();

    if (strictAnalyticIdsList.length > 0) {
      try {
        const candidateAmlFields = [
          'id', 'name', 'ref', 'move_id', 'partner_id', 'price_subtotal',
          'debit', 'credit', 'balance', 'move_type', 'analytic_account_id',
          'analytic_distribution', 'analytic_line_ids', 'date', 'parent_state', 'product_id'
        ];
        const safeAmlFields = Object.keys(amlFieldDefs).length > 0
          ? candidateAmlFields.filter(f => f in amlFieldDefs || f === 'id')
          : ['id', 'name', 'ref', 'move_id', 'price_subtotal', 'debit', 'credit', 'balance'];

        // Requête principale Odoo 16+ via analytic_line_ids.account_id
        try {
          const makeDomain: any[] = [
            ['analytic_line_ids.account_id', 'in', strictAnalyticIdsList],
            ['parent_state', '=', 'posted'],
            ['move_type', 'in', ['in_invoice', 'in_refund']]
          ];
          if (asOfDate && 'date' in amlFieldDefs) {
            makeDomain.push(['date', '<=', asOfDate]);
          }

          const resMake = await this.executeKw(
            credentials,
            uid,
            'account.move.line',
            'search_read',
            [makeDomain],
            { fields: safeAmlFields, limit: 4000 }
          );

          if (Array.isArray(resMake)) {
            resMake.forEach(line => {
              if (line && line.id && !seenGlobalPurchaseLineIds.has(line.id)) {
                if (line.move_type && ['out_invoice', 'out_refund'].includes(line.move_type)) return;
                const moveName = Array.isArray(line.move_id) ? line.move_id[1] : (line.ref || `Facture ${line.id}`);
                if (isExcludedPurchaseReference(moveName) || isExcludedPurchaseReference(line.ref) || isExcludedPurchaseReference(line.name)) return;
                seenGlobalPurchaseLineIds.add(line.id);
                allVendorBillLines.push(line);
              }
            });
          }
        } catch (domainErr) {
          console.warn('[WipOutflow] Requête analytic_line_ids.account_id:', domainErr);
        }

        // Requête secondaire Odoo standard via analytic_account_id direct
        if ('analytic_account_id' in amlFieldDefs) {
          try {
            const directDomain: any[] = [
              ['analytic_account_id', 'in', strictAnalyticIdsList],
              ['parent_state', '=', 'posted'],
              ['move_type', 'in', ['in_invoice', 'in_refund']]
            ];
            if (asOfDate && 'date' in amlFieldDefs) {
              directDomain.push(['date', '<=', asOfDate]);
            }

            const resDirect = await this.executeKw(
              credentials,
              uid,
              'account.move.line',
              'search_read',
              [directDomain],
              { fields: safeAmlFields, limit: 4000 }
            );

            if (Array.isArray(resDirect)) {
              resDirect.forEach(line => {
                if (line && line.id && !seenGlobalPurchaseLineIds.has(line.id)) {
                  if (line.move_type && ['out_invoice', 'out_refund'].includes(line.move_type)) return;
                  const moveName = Array.isArray(line.move_id) ? line.move_id[1] : (line.ref || `Facture ${line.id}`);
                  if (isExcludedPurchaseReference(moveName) || isExcludedPurchaseReference(line.ref) || isExcludedPurchaseReference(line.name)) return;
                  seenGlobalPurchaseLineIds.add(line.id);
                  allVendorBillLines.push(line);
                }
              });
            }
          } catch (eDirect) {
            console.warn('[WipOutflow] Requête direct analytic_account_id:', eDirect);
          }
        }
      } catch (eAml) {
        console.warn('[WipOutflow] Erreur recherche account.move.line:', eAml);
      }
    }

    // 3.3 Step C: Query Confirmed Purchase Order Lines (purchase.order.line)
    let allPoLines: any[] = [];
    const seenGlobalPoLineIds = new Set<number>();

    if (strictAnalyticIdsList.length > 0) {
      try {
        const candidatePolFields = [
          'id', 'name', 'order_id', 'partner_id', 'product_id', 'product_qty',
          'product_uom_qty', 'qty_invoiced', 'price_unit', 'price_subtotal',
          'account_analytic_id', 'analytic_account_id', 'analytic_distribution',
          'date_order', 'state'
        ];
        const safePolFields = Object.keys(polFieldDefs).length > 0
          ? candidatePolFields.filter(f => f in polFieldDefs || f === 'id')
          : ['id', 'name', 'order_id', 'partner_id', 'product_id', 'product_qty', 'qty_invoiced', 'price_unit', 'price_subtotal'];

        const polClauses: any[] = [];
        if ('account_analytic_id' in polFieldDefs) {
          polClauses.push(['account_analytic_id', 'in', strictAnalyticIdsList]);
        }
        if ('analytic_account_id' in polFieldDefs) {
          polClauses.push(['analytic_account_id', 'in', strictAnalyticIdsList]);
        }
        if ('analytic_distribution' in polFieldDefs) {
          polClauses.push(['analytic_distribution', '!=', false]);
        }

        for (const clause of polClauses) {
          try {
            const domainPo: any[] = [
              clause,
              ['order_id.state', 'in', ['purchase', 'done']]
            ];
            if (asOfDate && 'date_order' in polFieldDefs) {
              domainPo.push(['date_order', '<=', asOfDate]);
            }
            const resPo = await this.executeKw(
              credentials, uid, 'purchase.order.line', 'search_read', [domainPo], { fields: safePolFields, limit: 3000 }
            );
            if (Array.isArray(resPo)) {
              resPo.forEach(line => {
                const poName = line.order_id && Array.isArray(line.order_id) ? line.order_id[1] : `PO #${line.id}`;
                if (isExcludedPurchaseReference(poName) || isExcludedPurchaseReference(line.name)) return;
                if (!seenGlobalPoLineIds.has(line.id)) {
                  seenGlobalPoLineIds.add(line.id);
                  allPoLines.push(line);
                }
              });
            }
          } catch (ePo) {
            console.warn('[WipOutflow] POL query clause error:', ePo);
          }
        }
      } catch (ePol) {
        console.warn('[WipOutflow] Erreur recherche purchase.order.line:', ePol);
      }
    }

    // =========================================================================
    // 4. CONSOLIDER STRICTEMENT PAR FACTURE CLIENT VIA SON COMPTE ANALYTIQUE UNIQUE
    // Règle 3 : Dédoublonnage strict par ID Odoo unique (line.id)
    // Total calculé strictement égal au tableau de bord Projet Odoo ("Autres coûts")
    // =========================================================================
    const records: WipOutflowInvoiceItem[] = targetInvoices.map((inv: any) => {
      const isRefund = inv.move_type === 'out_refund';
      const sign = isRefund ? -1 : 1;
      const salesUntaxed = Math.round((Number(inv.amount_untaxed) || 0) * sign * 100) / 100;
      const salesTotal = Math.round((Number(inv.amount_total) || 0) * sign * 100) / 100;

      const partnerName = Array.isArray(inv.partner_id) ? inv.partner_id[1] : 'Client non renseigné';
      const partnerId = Array.isArray(inv.partner_id) ? inv.partner_id[0] : 0;
      const orderRef = inv.invoice_origin || inv.ref || 'Sans commande';

      const linkedSo = invoiceToLinkedSo.get(inv.id);
      const targetAnalyticId = invoiceToStrictAnalyticId.get(inv.id);
      const targetAnalyticName = invoiceToStrictAnalyticName.get(inv.id);
      const primaryProjectId = invoiceToProjectId.get(inv.id);
      const primaryProjectName = invoiceToProjectName.get(inv.id);

      const seenBillMoveLineIds = new Set<number>();
      const seenAnalyticLineIds = new Set<number>();
      const seenPoLineIds = new Set<number>();
      const purchaseDetails: WipPurchaseDetailItem[] = [];

      // Si la facture ou commande n'a AUCUN compte analytique strict, aucun achat ne peut lui être rattaché
      if (typeof targetAnalyticId === 'number') {

        // A. ÉCRITURES ANALYTIQUES DU PROJET (account.analytic.line)
        // Modèle source du tableau de bord Projet Odoo ("Autres coûts" / "Achats")
        for (const al of allAnalyticLines) {
          if (asOfDate && al.date && String(al.date).slice(0, 10) > asOfDate) {
            continue;
          }

          // FILTRAGE STRICT : le compte analytique doit être EXACTEMENT celui de l'affaire
          const lineAccId = Array.isArray(al[aalAccountField]) ? al[aalAccountField][0] : al[aalAccountField];
          if (lineAccId !== targetAnalyticId) {
            continue;
          }

          // Exclure formellement toute référence FV (facture client) ou ODMEN
          const alRef = String(al.ref || '').trim();
          const alName = String(al.name || '').trim();
          const alMoveName = (Array.isArray(al.move_id) ? String(al.move_id[1] || '') : (Array.isArray(al.move_line_id) ? String(al.move_line_id[1] || '') : '')).trim();
          if (isExcludedPurchaseReference(alRef) || isExcludedPurchaseReference(alName) || isExcludedPurchaseReference(alMoveName)) {
            continue;
          }

          // Les feuilles de temps (timesheets) sont de la main d'œuvre, pas des achats/autres coûts
          if (classifyAnalyticLine(al) === 'timesheet') {
            continue;
          }

          // Dédoublonnage strict par ID de ligne analytique
          if (al.id && seenAnalyticLineIds.has(al.id)) {
            continue;
          }

          const moveLineId = al.move_line_id ? (Array.isArray(al.move_line_id) ? al.move_line_id[0] : Number(al.move_line_id)) : null;
          if (moveLineId && seenBillMoveLineIds.has(moveLineId)) {
            continue;
          }

          if (al.id) seenAnalyticLineIds.add(al.id);
          if (moveLineId) seenBillMoveLineIds.add(moveLineId);

          // Dans account.analytic.line d'Odoo, les dépenses/achats ont un montant négatif (amount < 0)
          // Dans le tableau de bord Projet Odoo, le coût affiché est égal à -amount (positif)
          const rawAmount = Number(al.amount) || 0;
          let costVal = -rawAmount;

          const isExplicitExtourne = (
            alName.toLowerCase().includes('extourne') ||
            alRef.toLowerCase().includes('extourne') ||
            alName.toLowerCase().includes('annulation') ||
            alRef.toLowerCase().includes('annulation') ||
            alName.toLowerCase().includes('reversal') ||
            alName.toLowerCase().includes('avoir')
          );

          if (isExplicitExtourne && costVal > 0) {
            costVal = -costVal;
          }

          const finalCost = Math.round(costVal * 100) / 100;
          if (finalCost === 0) continue;

          const accLabel = Array.isArray(al.account_id) ? String(al.account_id[1]) : '';
          const isMOU500 = accLabel.toUpperCase().includes('MOU500');
          const isPO = Boolean(al.purchase_line_id && al.purchase_line_id !== false);
          const supplierName = Array.isArray(al.partner_id) ? al.partner_id[1] : 'Fournisseur / Sous-traitance projet';
          const finalRef = al.ref || (Array.isArray(al.move_line_id) ? al.move_line_id[1] : (Array.isArray(al.purchase_line_id) ? al.purchase_line_id[1] : (al.name || `Écriture #${al.id}`)));

          if (isExcludedPurchaseReference(finalRef)) continue;

          purchaseDetails.push({
            id: al.id ? `aal-${al.id}` : (moveLineId || Math.random()),
            type: moveLineId ? 'vendor_bill' : 'analytic_line',
            typeLabel: moveLineId ? 'Facture Fournisseur (Projet)' : (isMOU500 ? 'Achat matériel (MOU500)' : 'Achat projet (analytique)'),
            reference: finalRef,
            partnerId: Array.isArray(al.partner_id) ? al.partner_id[0] : undefined,
            partnerName: supplierName,
            date: al.date || '',
            productLabel: al.name || (isMOU500 ? 'Achat matériel / MOU500' : (isPO ? 'Achat bon de commande fournisseur' : 'Achat fournisseur projet')),
            amountUntaxed: finalCost,
            projectId: primaryProjectId,
            projectName: primaryProjectName,
            odooUrl: moveLineId
              ? `${cleanUrl}/web#id=${moveLineId}&model=account.move.line&view_type=form`
              : `${cleanUrl}/web#id=${al.id}&model=account.analytic.line&view_type=form`
          });
        }

        // B. FACTURES FOURNISSEURS COMPLÉMENTAIRES (account.move.line non encore présentes dans AAL)
        for (const pl of allVendorBillLines) {
          if (asOfDate && pl.date && String(pl.date).slice(0, 10) > asOfDate) {
            continue;
          }
          if (pl.id && seenBillMoveLineIds.has(pl.id)) {
            continue;
          }

          if (pl.move_type && ['out_invoice', 'out_refund'].includes(pl.move_type)) {
            continue;
          }
          const moveRefCand = Array.isArray(pl.move_id) ? pl.move_id[1] : (pl.ref || '');
          if (isExcludedPurchaseReference(moveRefCand) || isExcludedPurchaseReference(pl.ref) || isExcludedPurchaseReference(pl.name)) {
            continue;
          }

          // FILTRAGE STRICT SUR LE COMPTE ANALYTIQUE DE L'AFFAIRE
          let matchedPercentage = 0;
          if (pl.analytic_account_id && Array.isArray(pl.analytic_account_id) && pl.analytic_account_id[0] === targetAnalyticId) {
            matchedPercentage = 100;
          } else if (pl.analytic_distribution) {
            let dist: Record<string, number> = {};
            if (typeof pl.analytic_distribution === 'string') {
              try { dist = JSON.parse(pl.analytic_distribution); } catch { dist = {}; }
            } else if (typeof pl.analytic_distribution === 'object') {
              dist = pl.analytic_distribution;
            }
            const parsedDist = parseDistributionKeys(dist);
            for (const entry of parsedDist) {
              if (entry.accountIds.includes(targetAnalyticId)) {
                matchedPercentage += entry.percentage;
              }
            }
          }

          // STRICT : Aucun rattachement générique si le compte analytique exact n'est pas présent
          if (matchedPercentage > 0) {
            if (pl.id) seenBillMoveLineIds.add(pl.id);
            if (Array.isArray(pl.analytic_line_ids)) {
              for (const aalId of pl.analytic_line_ids) {
                if (typeof aalId === 'number') seenAnalyticLineIds.add(aalId);
              }
            }

            const debit = Number(pl.debit) || 0;
            const credit = Number(pl.credit) || 0;
            const balance = pl.balance !== undefined && pl.balance !== null ? Number(pl.balance) : (debit - credit);

            const plName = String(pl.name || '').toLowerCase();
            const plRef = String(pl.ref || '').toLowerCase();
            const plMoveName = Array.isArray(pl.move_id) ? String(pl.move_id[1] || '').toLowerCase() : '';
            const isExtourneOrCreditNote = (
              credit > debit ||
              balance < 0 ||
              plName.includes('extourne') ||
              plRef.includes('extourne') ||
              plMoveName.includes('extourne') ||
              plName.includes('annulation') ||
              plRef.includes('annulation') ||
              plName.includes('reversal') ||
              plName.includes('avoir') ||
              String(pl.move_type || '').includes('refund')
            );

            let rawSubtotal = 0;
            if (debit > 0 || credit > 0) {
              rawSubtotal = debit - credit;
            } else if (pl.price_subtotal !== undefined && pl.price_subtotal !== null && Number(pl.price_subtotal) !== 0) {
              const sub = Number(pl.price_subtotal);
              rawSubtotal = isExtourneOrCreditNote ? (sub < 0 ? sub : -Math.abs(sub)) : sub;
            } else {
              rawSubtotal = balance;
            }

            if (isExtourneOrCreditNote && rawSubtotal > 0) {
              rawSubtotal = -rawSubtotal;
            }

            const allocatedSubtotal = Math.round(rawSubtotal * (matchedPercentage / 100) * 100) / 100;
            if (allocatedSubtotal === 0) continue;

            const moveId = Array.isArray(pl.move_id) ? pl.move_id[0] : pl.id;
            const moveName = Array.isArray(pl.move_id) ? pl.move_id[1] : (pl.ref || `Facture ${pl.id}`);
            const supplierName = Array.isArray(pl.partner_id) ? pl.partner_id[1] : 'Fournisseur non renseigné';
            const prodName = Array.isArray(pl.product_id) ? pl.product_id[1] : (pl.name || pl.ref || 'Achat fournisseur projet');

            if (isExcludedPurchaseReference(moveName)) continue;

            purchaseDetails.push({
              id: pl.id,
              type: 'vendor_bill',
              typeLabel: 'Facture Fournisseur (Projet)',
              reference: moveName,
              partnerId: Array.isArray(pl.partner_id) ? pl.partner_id[0] : undefined,
              partnerName: supplierName,
              date: pl.date || '',
              productLabel: prodName,
              amountUntaxed: allocatedSubtotal,
              projectId: primaryProjectId,
              projectName: primaryProjectName,
              odooUrl: `${cleanUrl}/web#id=${moveId}&model=account.move&view_type=form`
            });
          }
        }

        // C. BONS DE COMMANDE FOURNISSEURS NON ENCORE FACTURÉS (purchase.order.line)
        for (const pol of allPoLines) {
          if (asOfDate && pol.date_order && String(pol.date_order).slice(0, 10) > asOfDate) {
            continue;
          }
          if (pol.id && seenPoLineIds.has(pol.id)) {
            continue;
          }

          const poName = pol.order_id && Array.isArray(pol.order_id) ? pol.order_id[1] : `PO #${pol.id}`;
          if (isExcludedPurchaseReference(poName) || isExcludedPurchaseReference(pol.name)) {
            continue;
          }

          // FILTRAGE STRICT SUR LE COMPTE ANALYTIQUE DE L'AFFAIRE
          let matchedPercentage = 0;
          if (pol.analytic_account_id && Array.isArray(pol.analytic_account_id) && pol.analytic_account_id[0] === targetAnalyticId) {
            matchedPercentage = 100;
          } else if (pol.account_analytic_id && Array.isArray(pol.account_analytic_id) && pol.account_analytic_id[0] === targetAnalyticId) {
            matchedPercentage = 100;
          } else if (pol.analytic_distribution) {
            let dist: Record<string, number> = {};
            if (typeof pol.analytic_distribution === 'string') {
              try { dist = JSON.parse(pol.analytic_distribution); } catch { dist = {}; }
            } else if (typeof pol.analytic_distribution === 'object') {
              dist = pol.analytic_distribution;
            }
            const parsedDist = parseDistributionKeys(dist);
            for (const entry of parsedDist) {
              if (entry.accountIds.includes(targetAnalyticId)) {
                matchedPercentage += entry.percentage;
              }
            }
          }

          if (matchedPercentage > 0) {
            const qtyOrdered = Number(pol.product_qty !== undefined ? pol.product_qty : (pol.product_uom_qty || 0));
            const qtyInvoiced = Number(pol.qty_invoiced || 0);
            const priceUnit = Number(pol.price_unit || 0);
            const qtyToInvoice = Math.max(0, qtyOrdered - qtyInvoiced);

            let pendingAmount = 0;
            if (qtyToInvoice > 0) {
              pendingAmount = Math.round(qtyToInvoice * priceUnit * (matchedPercentage / 100) * 100) / 100;
            } else if (qtyInvoiced === 0 && Number(pol.price_subtotal) > 0) {
              pendingAmount = Math.round(Number(pol.price_subtotal) * (matchedPercentage / 100) * 100) / 100;
            }

            if (pendingAmount <= 0) continue;

            if (pol.id) seenPoLineIds.add(pol.id);

            const poId = pol.order_id && Array.isArray(pol.order_id) ? pol.order_id[0] : pol.id;
            const supplierName = Array.isArray(pol.partner_id) ? pol.partner_id[1] : 'Fournisseur non renseigné';

            purchaseDetails.push({
              id: pol.id,
              type: 'purchase_order',
              typeLabel: qtyInvoiced > 0 ? 'Bon de Commande (Reliquat)' : 'Bon de Commande Fournisseur',
              reference: poName,
              partnerId: Array.isArray(pol.partner_id) ? pol.partner_id[0] : undefined,
              partnerName: supplierName,
              date: pol.date_order ? pol.date_order.slice(0, 10) : '',
              productLabel: pol.name || (Array.isArray(pol.product_id) ? pol.product_id[1] : 'Article commandé'),
              amountUntaxed: pendingAmount,
              projectId: primaryProjectId,
              projectName: primaryProjectName,
              odooUrl: `${cleanUrl}/web#id=${poId}&model=purchase.order&view_type=form`
            });
          }
        }
      }

      // Filtrage final strict de sécurité pour garantir qu'aucune pièce FV ou ODMEN ne subsiste
      const validPurchaseDetails = purchaseDetails.filter(p => !isExcludedPurchaseReference(p.reference));
      const attachedPurchasesUntaxed = Math.round(validPurchaseDetails.reduce((sum, p) => sum + p.amountUntaxed, 0) * 100) / 100;
      const grossMarginUntaxed = Math.round((salesUntaxed - attachedPurchasesUntaxed) * 100) / 100;
      const grossMarginRate = salesUntaxed > 0 ? Math.round((grossMarginUntaxed / salesUntaxed) * 1000) / 10 : 0;

      return {
        id: inv.id,
        invoiceNumber: inv.name || `INV #${inv.id}`,
        invoiceDate: inv.invoice_date || '',
        monthKey: selectedMonthKey,
        saleOrderId: linkedSo?.id,
        saleOrderName: linkedSo?.name || primaryProjectName || orderRef,
        projectId: primaryProjectId,
        projectName: primaryProjectName,
        analyticAccountId: targetAnalyticId,
        analyticAccountName: targetAnalyticName,
        partnerId,
        partnerName,
        clientOrderRef: linkedSo?.client_order_ref || (inv.ref !== inv.invoice_origin ? inv.ref : undefined),
        commercialUser: Array.isArray(inv.invoice_user_id) ? inv.invoice_user_id[1] : undefined,
        invoicedSalesUntaxed: salesUntaxed,
        invoicedSalesTotal: salesTotal,
        attachedPurchasesUntaxed,
        grossMarginUntaxed,
        grossMarginRate,
        purchasesCount: validPurchaseDetails.length,
        purchaseDetails: validPurchaseDetails,
        odooInvoiceUrl: `${cleanUrl}/web#id=${inv.id}&model=account.move&view_type=form`,
        odooOrderUrl: linkedSo ? `${cleanUrl}/web#id=${linkedSo.id}&model=sale.order&view_type=form` : undefined
      };
    });

    // 6. Calcul des totaux généraux
    const totalInvoicedSalesUntaxed = Math.round(records.reduce((sum, r) => sum + r.invoicedSalesUntaxed, 0) * 100) / 100;
    const totalPurchasesOutflowUntaxed = Math.round(records.reduce((sum, r) => sum + r.attachedPurchasesUntaxed, 0) * 100) / 100;
    const totalGrossMarginUntaxed = Math.round((totalInvoicedSalesUntaxed - totalPurchasesOutflowUntaxed) * 100) / 100;
    const overallMarginRate = totalInvoicedSalesUntaxed > 0 
      ? Math.round((totalGrossMarginUntaxed / totalInvoicedSalesUntaxed) * 1000) / 10 
      : 0;

    const availableMonths: WipOutflowAvailableMonth[] = sortedMonthKeys.map(k => {
      const y = parseInt(k.slice(0, 4), 10);
      const m = parseInt(k.slice(5, 7), 10);
      const info = monthMap.get(k) || { count: 0, sales: 0 };
      return {
        monthKey: k,
        monthLabel: `${MONTH_NAMES_FR[m - 1] || 'Mois'} ${y}`,
        year: y,
        month: m,
        invoicesCount: info.count,
        totalSalesUntaxed: Math.round(info.sales * 100) / 100,
        totalPurchasesUntaxed: 0
      };
    });

    const result: WipOutflowReportResponse = {
      success: true,
      records,
      summary: {
        selectedMonthKey,
        selectedMonthLabel,
        totalInvoicesCount: records.length,
        totalOrdersCount: new Set(records.map(r => r.saleOrderName)).size,
        totalInvoicedSalesUntaxed,
        totalPurchasesOutflowUntaxed,
        totalGrossMarginUntaxed,
        overallMarginRate,
        availableMonths
      },
      fromCache: false,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      isDemo: false
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // Version Démo Sandbox pour le rapport Sorties d'Encours Achats
  public getMockWipPurchasesOutflowReport(options: {
    monthKey?: string;
  } = {}): WipOutflowReportResponse {
    const selectedMonthKey = options.monthKey || '2026-08';

    const MOCK_MONTHS: Record<string, { label: string; records: WipOutflowInvoiceItem[] }> = {
      '2026-09': {
        label: 'Septembre 2026',
        records: [
          {
            id: 218,
            invoiceNumber: 'FV/2026/00182',
            invoiceDate: '2026-09-28',
            monthKey: '2026-09',
            saleOrderId: 182,
            saleOrderName: 'SO/2026/00182',
            projectId: 82,
            projectName: 'Projet Affaire SO/2026/00182',
            analyticAccountId: 1082,
            analyticAccountName: 'Affaire SO/2026/00182',
            partnerId: 92,
            partnerName: 'Eiffage Construction (Client FV/2026/00182)',
            clientOrderRef: 'EIFF-2026-182',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 24800.00,
            invoicedSalesTotal: 29760.00,
            attachedPurchasesUntaxed: 10045.00,
            grossMarginUntaxed: 14755.00,
            grossMarginRate: 59.5,
            purchasesCount: 3,
            purchaseDetails: [
              {
                id: 381,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur (Projet)',
                reference: 'Ach/2026/00142',
                partnerName: 'Fournisseur Matériaux & Profilés Isolants',
                date: '2026-08-22',
                productLabel: 'Fourniture structures métalliques & profilés isolants projet',
                amountUntaxed: 4820.00,
                odooUrl: 'https://demo.odoo.com/web#id=381&model=account.move&view_type=form'
              },
              {
                id: 382,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur (Projet)',
                reference: 'Ach/2026/00155',
                partnerName: 'Entreprise Sous-traitance Montage & Pose',
                date: '2026-09-11',
                productLabel: 'Prestation de montage et assemblage technique sur site',
                amountUntaxed: 3450.00,
                odooUrl: 'https://demo.odoo.com/web#id=382&model=account.move&view_type=form'
              },
              {
                id: 383,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur (Projet)',
                reference: 'Ach/2026/00168',
                partnerName: 'Quincaillerie Industrielle & Consommables',
                date: '2026-09-19',
                productLabel: 'Lots visserie haute résistance et ancrages chimiques',
                amountUntaxed: 1775.00,
                odooUrl: 'https://demo.odoo.com/web#id=383&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=218&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=182&model=sale.order&view_type=form'
          },
          {
            id: 219,
            invoiceNumber: 'FV/2026/00184',
            invoiceDate: '2026-09-29',
            monthKey: '2026-09',
            saleOrderId: 184,
            saleOrderName: 'FMF250907',
            projectId: 84,
            projectName: 'Affaire FMF250907',
            analyticAccountId: 250907,
            analyticAccountName: 'Affaire FMF250907',
            partnerId: 94,
            partnerName: 'Client Affaire FMF250907',
            clientOrderRef: 'FMF250907',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 3200.00,
            invoicedSalesTotal: 3840.00,
            attachedPurchasesUntaxed: 854.00,
            grossMarginUntaxed: 2346.00,
            grossMarginRate: 73.3,
            purchasesCount: 1,
            purchaseDetails: [
              {
                id: 395,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur (Projet)',
                reference: 'Ach/2026/00195',
                partnerName: 'Fournisseur Matériaux Chantier FMF250907',
                date: '2026-09-18',
                productLabel: 'Fournitures et consommables spécifiques chantier FMF250907',
                amountUntaxed: 854.00,
                odooUrl: 'https://demo.odoo.com/web#id=395&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=219&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=184&model=sale.order&view_type=form'
          },
          {
            id: 215,
            invoiceNumber: 'INV/2026/00122',
            invoiceDate: '2026-09-26',
            monthKey: '2026-09',
            saleOrderId: 115,
            saleOrderName: 'SO/2026/00145',
            projectId: 15,
            projectName: 'Projet Isolation & Plâtrerie Knauf SAS',
            analyticAccountId: 1015,
            analyticAccountName: 'Affaire Knauf Bâtiment & Acoustique',
            partnerId: 85,
            partnerName: 'Knauf SAS (Client Grand Compte)',
            clientOrderRef: 'KNAUF-2026-09',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 22500.00,
            invoicedSalesTotal: 27000.00,
            attachedPurchasesUntaxed: 8120.00,
            grossMarginUntaxed: 14380.00,
            grossMarginRate: 63.9,
            purchasesCount: 2,
            purchaseDetails: [
              {
                id: 341,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur (Projet)',
                reference: 'BILL/2026/00059',
                partnerName: 'Fournisseur Matériaux & Isolants Pro (Strasbourg)',
                date: '2026-09-14',
                productLabel: 'Fourniture dalles acoustiques & Panneaux laine de roche Knauf',
                amountUntaxed: 5420.00,
                odooUrl: 'https://demo.odoo.com/web#id=341&model=account.move&view_type=form'
              },
              {
                id: 342,
                type: 'purchase_order',
                typeLabel: 'Bon de Commande Fournisseur (Projet)',
                reference: 'PO/2026/00067',
                partnerName: 'Transport & Manutention Spécialisée (Metz)',
                date: '2026-09-12',
                productLabel: 'Livraison par convoi spécialisé & Grutage chantier Knauf',
                amountUntaxed: 2700.00,
                odooUrl: 'https://demo.odoo.com/web#id=342&model=purchase.order&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=215&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=115&model=sale.order&view_type=form'
          },
          {
            id: 211,
            invoiceNumber: 'INV/2026/00112',
            invoiceDate: '2026-09-18',
            monthKey: '2026-09',
            saleOrderId: 111,
            saleOrderName: 'SO/2026/00134',
            analyticAccountId: 1011,
            analyticAccountName: 'Migration Infrastructure Novatech',
            partnerId: 88,
            partnerName: 'Novatech Industrie (Lille)',
            clientOrderRef: 'NOVA-IT-402',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 29800.00,
            invoicedSalesTotal: 35760.00,
            attachedPurchasesUntaxed: 11400.00,
            grossMarginUntaxed: 18400.00,
            grossMarginRate: 61.7,
            purchasesCount: 2,
            purchaseDetails: [
              {
                id: 310,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00051',
                partnerName: 'Fournisseur Global Logistics (Le Havre)',
                date: '2026-09-12',
                productLabel: 'Serveurs Rack 2U & Switchs Réseau Haute Densité',
                amountUntaxed: 7100.00,
                odooUrl: 'https://demo.odoo.com/web#id=310&model=account.move&view_type=form'
              },
              {
                id: 311,
                type: 'purchase_order',
                typeLabel: 'Bon de Commande',
                reference: 'PO/2026/00062',
                partnerName: 'Électronique Pro Components (Grenoble)',
                date: '2026-09-10',
                productLabel: 'Composants optiques SFP+ 10Gbps & Câblage certifié',
                amountUntaxed: 4300.00,
                odooUrl: 'https://demo.odoo.com/web#id=311&model=purchase.order&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=211&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=111&model=sale.order&view_type=form'
          },
          {
            id: 212,
            invoiceNumber: 'INV/2026/00115',
            invoiceDate: '2026-09-22',
            monthKey: '2026-09',
            saleOrderId: 108,
            saleOrderName: 'SO/2026/00135',
            analyticAccountId: 1008,
            analyticAccountName: 'Audit Énergétique EcoBat',
            partnerId: 22,
            partnerName: 'EcoBat Construction Durable (Toulouse)',
            clientOrderRef: 'ECO-26-44',
            commercialUser: 'Sophie Vendeuse',
            invoicedSalesUntaxed: 7600.00,
            invoicedSalesTotal: 9120.00,
            attachedPurchasesUntaxed: 2450.00,
            grossMarginUntaxed: 5150.00,
            grossMarginRate: 67.8,
            purchasesCount: 1,
            purchaseDetails: [
              {
                id: 312,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00053',
                partnerName: 'Matières Premières & Bois SA (Strasbourg)',
                date: '2026-09-15',
                productLabel: 'Capteurs d\'énergie IoT & Enregistreurs thermiques',
                amountUntaxed: 2450.00,
                odooUrl: 'https://demo.odoo.com/web#id=312&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=212&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=108&model=sale.order&view_type=form'
          },
          {
            id: 213,
            invoiceNumber: 'INV/2026/00118',
            invoiceDate: '2026-09-25',
            monthKey: '2026-09',
            saleOrderId: 112,
            saleOrderName: 'SO/2026/00133',
            analyticAccountId: 1012,
            analyticAccountName: 'Conformité Dispositifs Médicaux',
            partnerId: 72,
            partnerName: 'MedTech Santé Solutions (Rennes)',
            clientOrderRef: 'MED-2026-55',
            commercialUser: 'Sophie Vendeuse',
            invoicedSalesUntaxed: 12400.00,
            invoicedSalesTotal: 14880.00,
            attachedPurchasesUntaxed: 4180.00,
            grossMarginUntaxed: 8220.00,
            grossMarginRate: 66.3,
            purchasesCount: 1,
            purchaseDetails: [
              {
                id: 313,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00058',
                partnerName: 'Bureau Contrôle & Normes Médicales (Lyon)',
                date: '2026-09-19',
                productLabel: 'Prestation certification ISO 13485 & Dossier technique',
                amountUntaxed: 4180.00,
                odooUrl: 'https://demo.odoo.com/web#id=313&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=213&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=112&model=sale.order&view_type=form'
          }
        ]
      },
      '2026-08': {
        label: 'Août 2026',
        records: [
          {
            id: 205,
            invoiceNumber: 'INV/2026/00105',
            invoiceDate: '2026-08-25',
            monthKey: '2026-08',
            saleOrderId: 105,
            saleOrderName: 'SO/2026/00140',
            projectId: 15,
            projectName: 'Projet Isolation & Bâtiment Knauf',
            analyticAccountId: 1015,
            analyticAccountName: 'Affaire Knauf Acoustique & Isolation',
            partnerId: 85,
            partnerName: 'Knauf SAS (Client Grand Compte)',
            clientOrderRef: 'KNAUF-2026-08',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 21800.00,
            invoicedSalesTotal: 26160.00,
            attachedPurchasesUntaxed: 8140.00,
            grossMarginUntaxed: 13660.00,
            grossMarginRate: 62.7,
            purchasesCount: 2,
            purchaseDetails: [
              {
                id: 304,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur (Projet)',
                reference: 'BILL/2026/00049',
                partnerName: 'Fournisseur Matériaux & Isolants Pro (Strasbourg)',
                date: '2026-08-14',
                productLabel: 'Fourniture rouleaux & Panneaux isolants laine minérale Knauf',
                amountUntaxed: 5420.00,
                odooUrl: 'https://demo.odoo.com/web#id=304&model=account.move&view_type=form'
              },
              {
                id: 305,
                type: 'purchase_order',
                typeLabel: 'Bon de Commande Fournisseur (Projet)',
                reference: 'PO/2026/00059',
                partnerName: 'Transport & Manutention Spécialisée (Metz)',
                date: '2026-08-11',
                productLabel: 'Transport routier & Grutage sur site chantier Knauf',
                amountUntaxed: 2720.00,
                odooUrl: 'https://demo.odoo.com/web#id=305&model=purchase.order&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=205&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=105&model=sale.order&view_type=form'
          },
          {
            id: 201,
            invoiceNumber: 'INV/2026/00098',
            invoiceDate: '2026-08-21',
            monthKey: '2026-08',
            saleOrderId: 102,
            saleOrderName: 'SO/2026/00141',
            analyticAccountId: 1002,
            analyticAccountName: 'Prestation Design Azure Interior',
            partnerId: 24,
            partnerName: 'Azure Interior SARL (Paris)',
            clientOrderRef: 'AZ-2026-08',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 8400.00,
            invoicedSalesTotal: 10080.00,
            attachedPurchasesUntaxed: 3200.00,
            grossMarginUntaxed: 5200.00,
            grossMarginRate: 61.9,
            purchasesCount: 1,
            purchaseDetails: [
              {
                id: 204,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00045',
                partnerName: 'Fournisseur Global Logistics (Le Havre)',
                date: '2026-08-16',
                productLabel: 'Transport mobilier & Dédouanement maritime F-883',
                amountUntaxed: 3200.00,
                odooUrl: 'https://demo.odoo.com/web#id=204&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=201&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=102&model=sale.order&view_type=form'
          },
          {
            id: 202,
            invoiceNumber: 'INV/2026/00099',
            invoiceDate: '2026-08-19',
            monthKey: '2026-08',
            saleOrderId: 106,
            saleOrderName: 'SO/2026/00138',
            analyticAccountId: 1006,
            analyticAccountName: 'Agencement Mobilier Atelier Bois',
            partnerId: 9,
            partnerName: 'Atelier Bois & Métal (Bordeaux)',
            clientOrderRef: 'ABM-BOIS-09',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 18900.00,
            invoicedSalesTotal: 22680.00,
            attachedPurchasesUntaxed: 7850.00,
            grossMarginUntaxed: 11050.00,
            grossMarginRate: 58.5,
            purchasesCount: 2,
            purchaseDetails: [
              {
                id: 302,
                type: 'purchase_order',
                typeLabel: 'Bon de Commande',
                reference: 'PO/2026/00054',
                partnerName: 'Matières Premières & Bois SA (Strasbourg)',
                date: '2026-08-18',
                productLabel: 'Fourniture panneaux chêne massif & Profilés acier',
                amountUntaxed: 5600.00,
                odooUrl: 'https://demo.odoo.com/web#id=302&model=purchase.order&view_type=form'
              },
              {
                id: 206,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00047',
                partnerName: 'Quincaillerie Industrielle Pro (Nantes)',
                date: '2026-08-17',
                productLabel: 'Ferronnerie sur mesure & Fixations lourdes',
                amountUntaxed: 2250.00,
                odooUrl: 'https://demo.odoo.com/web#id=206&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=202&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=106&model=sale.order&view_type=form'
          },
          {
            id: 203,
            invoiceNumber: 'INV/2026/00100',
            invoiceDate: '2026-08-17',
            monthKey: '2026-08',
            saleOrderId: 105,
            saleOrderName: 'SO/2026/00137',
            analyticAccountId: 1005,
            analyticAccountName: 'Projet Digital Alpha Conseil',
            partnerId: 45,
            partnerName: 'Cabinet Alpha Conseil (Genève)',
            clientOrderRef: 'ALPHA-CH-2026',
            commercialUser: 'Sophie Vendeuse',
            invoicedSalesUntaxed: 34500.00,
            invoicedSalesTotal: 34500.00,
            attachedPurchasesUntaxed: 12900.00,
            grossMarginUntaxed: 21600.00,
            grossMarginRate: 62.6,
            purchasesCount: 2,
            purchaseDetails: [
              {
                id: 301,
                type: 'purchase_order',
                typeLabel: 'Bon de Commande',
                reference: 'PO/2026/00055',
                partnerName: 'Fournisseur Global Logistics (Le Havre)',
                date: '2026-08-15',
                productLabel: 'Prestation infogérance serveurs & Licences logicielles',
                amountUntaxed: 9500.00,
                odooUrl: 'https://demo.odoo.com/web#id=301&model=purchase.order&view_type=form'
              },
              {
                id: 208,
                type: 'analytic_line',
                typeLabel: 'Ligne Analytique',
                reference: 'PRAGMA/2026/0019',
                partnerName: 'Sous-traitant Expert Cloud Security',
                date: '2026-08-16',
                productLabel: 'Audit d\'intrusion & Tests de pénétration RGPD',
                amountUntaxed: 3400.00,
                odooUrl: 'https://demo.odoo.com/web#id=208&model=account.analytic.line&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=203&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=105&model=sale.order&view_type=form'
          }
        ]
      },
      '2026-07': {
        label: 'Juillet 2026',
        records: [
          {
            id: 198,
            invoiceNumber: 'INV/2026/00084',
            invoiceDate: '2026-07-28',
            monthKey: '2026-07',
            saleOrderId: 98,
            saleOrderName: 'SO/2026/00120',
            analyticAccountId: 998,
            analyticAccountName: 'Mobilier Suites Riviera',
            partnerId: 14,
            partnerName: 'Grand Hôtel Riviera (Nice)',
            clientOrderRef: 'GHR-JUIL-01',
            commercialUser: 'Marc Demo',
            invoicedSalesUntaxed: 15200.00,
            invoicedSalesTotal: 18240.00,
            attachedPurchasesUntaxed: 5600.00,
            grossMarginUntaxed: 9600.00,
            grossMarginRate: 63.2,
            purchasesCount: 1,
            purchaseDetails: [
              {
                id: 298,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00038',
                partnerName: 'Matières Premières & Bois SA (Strasbourg)',
                date: '2026-07-20',
                productLabel: 'Têtes de lit en noyer & Habillages muraux',
                amountUntaxed: 5600.00,
                odooUrl: 'https://demo.odoo.com/web#id=298&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=198&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=98&model=sale.order&view_type=form'
          },
          {
            id: 199,
            invoiceNumber: 'INV/2026/00089',
            invoiceDate: '2026-07-22',
            monthKey: '2026-07',
            saleOrderId: 99,
            saleOrderName: 'SO/2026/00125',
            analyticAccountId: 999,
            analyticAccountName: 'Acoustique Lumina',
            partnerId: 31,
            partnerName: 'Lumina Design Studio (Bruxelles)',
            clientOrderRef: 'LUM-BE-44',
            commercialUser: 'Sophie Vendeuse',
            invoicedSalesUntaxed: 21000.00,
            invoicedSalesTotal: 25200.00,
            attachedPurchasesUntaxed: 8300.00,
            grossMarginUntaxed: 12700.00,
            grossMarginRate: 60.5,
            purchasesCount: 1,
            purchaseDetails: [
              {
                id: 299,
                type: 'vendor_bill',
                typeLabel: 'Facture Fournisseur',
                reference: 'BILL/2026/00041',
                partnerName: 'Électronique Pro Components (Grenoble)',
                date: '2026-07-15',
                productLabel: 'Modules d\'amplification & Systèmes de diffusion',
                amountUntaxed: 8300.00,
                odooUrl: 'https://demo.odoo.com/web#id=299&model=account.move&view_type=form'
              }
            ],
            odooInvoiceUrl: 'https://demo.odoo.com/web#id=199&model=account.move&view_type=form',
            odooOrderUrl: 'https://demo.odoo.com/web#id=99&model=sale.order&view_type=form'
          }
        ]
      }
    };

    const targetMonth = MOCK_MONTHS[selectedMonthKey] || MOCK_MONTHS['2026-09'];
    const records = targetMonth.records;

    const totalInvoicedSalesUntaxed = Math.round(records.reduce((sum, r) => sum + r.invoicedSalesUntaxed, 0) * 100) / 100;
    const totalPurchasesOutflowUntaxed = Math.round(records.reduce((sum, r) => sum + r.attachedPurchasesUntaxed, 0) * 100) / 100;
    const totalGrossMarginUntaxed = Math.round((totalInvoicedSalesUntaxed - totalPurchasesOutflowUntaxed) * 100) / 100;
    const overallMarginRate = totalInvoicedSalesUntaxed > 0 
      ? Math.round((totalGrossMarginUntaxed / totalInvoicedSalesUntaxed) * 1000) / 10 
      : 0;

    const availableMonths: WipOutflowAvailableMonth[] = [
      {
        monthKey: '2026-09',
        monthLabel: 'Septembre 2026',
        year: 2026,
        month: 9,
        invoicesCount: 3,
        totalSalesUntaxed: 49800.00,
        totalPurchasesUntaxed: 18030.00
      },
      {
        monthKey: '2026-08',
        monthLabel: 'Août 2026',
        year: 2026,
        month: 8,
        invoicesCount: 3,
        totalSalesUntaxed: 61800.00,
        totalPurchasesUntaxed: 23950.00
      },
      {
        monthKey: '2026-07',
        monthLabel: 'Juillet 2026',
        year: 2026,
        month: 7,
        invoicesCount: 2,
        totalSalesUntaxed: 36200.00,
        totalPurchasesUntaxed: 13900.00
      }
    ];

    return {
      success: true,
      records,
      summary: {
        selectedMonthKey,
        selectedMonthLabel: targetMonth.label,
        totalInvoicesCount: records.length,
        totalOrdersCount: new Set(records.map(r => r.saleOrderName)).size,
        totalInvoicedSalesUntaxed,
        totalPurchasesOutflowUntaxed,
        totalGrossMarginUntaxed,
        overallMarginRate,
        availableMonths
      },
      fromCache: false,
      executionTimeMs: 12,
      timestamp: new Date().toISOString(),
      isDemo: true
    };
  }

  // =========================================================================
  // RAPPORT / WIDGET : "AUGMENTATION DE L'ENCOURS" (ACHATS ENGAGÉS NON FACTURÉS DU MOIS)
  //
  // 1. RÈGLES DE SÉLECTION DES COMMANDES (PÉRIMÈTRE) :
  //    - Sélectionner uniquement les Commandes de Vente (sale.order) en cours (state in ('sale', 'done')).
  //    - Restreindre STRICTEMENT aux commandes dont le montant total est > 500,00 € (> 500€).
  //    - Les commandes doivent impérativement être liées à un projet / compte analytique valide.
  //
  // 2. CALCUL DES ACHATS COMMANDÉS MAIS NON FACTURÉS (OU FACTURÉS PARTIELLEMENT) :
  //    - Pour chaque commande éligible du mois :
  //      * Récupérer la totalité des engagements / achats fournisseurs rattachés (Bons de commande / lignes analytiques).
  //      * S'il y a eu une facturation partielle par le fournisseur, appliquer le delta : ne conserver que la part non encore facturée (montant commandé - montant déjà facturé).
  //      * Exclure les achats déjà totalement facturés et sortis de l'encours (qty_invoiced >= qty_ordered).
  //      * Exclure formellement les références de facturation client commençant par FV ou ODMEN.
  //
  // 3. RESTRICTION D'AFFICHAGE :
  //    - Ce rapport doit afficher uniquement la somme totale globale de ces achats en encours pour le mois sélectionné.
  //      (affichage d'un montant synthétique épuré, ex: "Total Achats en Cours du mois : X XXX,XX €").
  //    - Permettre de filtrer ou de sélectionner le mois civil souhaité (ex: Septembre 2026).
  // =========================================================================

  public async getWipPurchasesInflowReport(
    credentials: OdooConnectionCredentials,
    options: {
      monthKey?: string;
      forceRefresh?: boolean;
    } = {}
  ): Promise<WipPurchasesInflowReportResponse> {
    const startTime = Date.now();
    const selectedMonthKey = options.monthKey ? String(options.monthKey).trim() : '2026-09';
    const cacheKey = this.getCacheKey('wip_purchases_inflow_report', {
      url: credentials.url,
      db: credentials.db,
      user: credentials.username,
      monthKey: selectedMonthKey
    });

    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          ...cached,
          fromCache: true,
          executionTimeMs: Date.now() - startTime
        };
      }
    }

    // 1. Authentification Odoo
    const authRes = await this.testConnection(credentials);
    if (!authRes.success || !authRes.uid) {
      throw new Error(authRes.error || "Échec d'authentification Odoo.");
    }
    const uid = authRes.uid;

    // Introspection des champs Odoo
    const [poFields, polFields, saleFields, projectFields, analyticFields] = await Promise.all([
      this.getModelFields(credentials, uid, 'purchase.order').catch(() => ({})),
      this.getModelFields(credentials, uid, 'purchase.order.line').catch(() => ({})),
      this.getModelFields(credentials, uid, 'sale.order').catch(() => ({})),
      this.getModelFields(credentials, uid, 'project.project').catch(() => ({})),
      this.getModelFields(credentials, uid, 'account.analytic.account').catch(() => ({}))
    ]);

    const poFieldsSet = new Set(Object.keys(poFields));
    const polFieldsSet = new Set(Object.keys(polFields));
    const projectFieldsSet = new Set(Object.keys(projectFields));
    const analyticFieldsSet = new Set(Object.keys(analyticFields));

    // Détermination de la plage temporelle du mois civil sélectionné (ex: 2026-09)
    const [yr, mo] = selectedMonthKey.split('-');
    const year = parseInt(yr, 10) || 2026;
    const month = parseInt(mo, 10) || 9;
    const lastDay = new Date(year, month, 0).getDate();

    // 1. RÈGLE CRITIQUE D'ÉLIGIBILITÉ (CORRECTION UTILISATEUR) :
    // "DANS L'augmentation des encours, ce n'est pas les ventes qui doivent être supérieur à 500 €, 
    // ce sont les commandes d'achat. Si le total de la commande d'achat est inférieur à 500 € on ne l'additionne pas dans l'encours. 
    // Il faut par contre calculer tous les achats faits dans le mois et qui n'ont pas encore été facturés."

    // Récupération des Commandes d'Achat (purchase.order) confirmées du mois civil
    const candidatePoFields = [
      'id', 'name', 'partner_id', 'date_order', 'date_approve', 
      'amount_untaxed', 'amount_total', 'state', 'invoice_status', 
      'order_line', 'origin', 'account_analytic_id', 'analytic_account_id', 'project_id'
    ];
    const safePoFields = candidatePoFields.filter(f => poFieldsSet.has(f) || f === 'id');

    let rawPurchaseOrders: any[] = [];
    
    // Requête des commandes d'achat confirmées ('purchase', 'done')
    try {
      const poDomain: any[] = [
        ['state', 'in', ['purchase', 'done']]
      ];
      if (poFieldsSet.has('date_order')) {
        poDomain.push(['date_order', '>=', `${selectedMonthKey}-01 00:00:00`]);
        poDomain.push(['date_order', '<=', `${selectedMonthKey}-${String(lastDay).padStart(2, '0')} 23:59:59`]);
      }
      rawPurchaseOrders = await this.executeKw(
        credentials,
        uid,
        'purchase.order',
        'search_read',
        [poDomain],
        { fields: safePoFields, limit: 1500 }
      );
    } catch (dateErr: any) {
      console.warn('[WipInflow] Recherche purchase.order par date notice, repli mémoire:', dateErr?.message);
      try {
        rawPurchaseOrders = await this.executeKw(
          credentials,
          uid,
          'purchase.order',
          'search_read',
          [[['state', 'in', ['purchase', 'done']]]],
          { fields: safePoFields, limit: 2000, order: 'date_order desc' }
        );
      } catch (err: any) {
        console.warn('[WipInflow] Erreur recherche purchase.order:', err.message);
        rawPurchaseOrders = [];
      }
    }

    if (!Array.isArray(rawPurchaseOrders)) {
      rawPurchaseOrders = [];
    }

    // 2. FILTRAGE DU MOIS CIVIL SÉLECTIONNÉ :
    // On conserve les commandes d'achat faites dans le mois (date_order ou date_approve)
    const monthPurchaseOrders = rawPurchaseOrders.filter(po => {
      const orderDateStr = String(po.date_order || po.date_approve || '');
      return orderDateStr.startsWith(selectedMonthKey);
    });

    // 3. RÈGLE STRICTE DES 500 € SUR LES COMMANDES D'ACHAT :
    // "Si le total de la commande d'achat est inférieur à 500 € on ne l'additionne pas dans l'encours."
    let totalExcludedUnder500Count = 0;
    const eligiblePurchaseOrders = monthPurchaseOrders.filter(po => {
      // Exclure les éventuelles références erronées (FV ou ODMEN)
      if (isExcludedPurchaseReference(po.name) || isExcludedPurchaseReference(po.origin)) {
        return false;
      }
      const totalAmount = Number(po.amount_total !== undefined ? po.amount_total : (po.amount_untaxed || 0));
      if (totalAmount < 500) {
        totalExcludedUnder500Count++;
        return false; // Commande d'achat < 500 € : strictement exclue de l'encours
      }
      return true;
    });

    const eligiblePoIds = eligiblePurchaseOrders.map(p => p.id).filter(id => typeof id === 'number');

    // 4. RÉCUPÉRATION DES LIGNES D'ACHATS (purchase.order.line)
    // Pour calculer avec précision la part non encore facturée (Montant commandé - Montant déjà facturé)
    let purchaseOrderLines: any[] = [];
    if (eligiblePoIds.length > 0 && polFieldsSet.size > 0) {
      const candidatePolFields = [
        'id', 'order_id', 'name', 'product_id', 'product_qty', 'product_uom_qty',
        'qty_invoiced', 'qty_received', 'price_unit', 'price_subtotal', 'price_total',
        'account_analytic_id', 'analytic_account_id', 'analytic_distribution', 'state'
      ];
      const safePolFields = candidatePolFields.filter(f => polFieldsSet.has(f) || f === 'id');

      try {
        const pols = await this.executeKw(
          credentials,
          uid,
          'purchase.order.line',
          'search_read',
          [[['order_id', 'in', eligiblePoIds]]],
          { fields: safePolFields, limit: 3000 }
        );
        if (Array.isArray(pols)) {
          purchaseOrderLines = pols;
        }
      } catch (polErr: any) {
        console.warn('[WipInflow] Recherche purchase.order.line notice:', polErr?.message);
        purchaseOrderLines = [];
      }
    }

    // Regrouper les lignes par commande d'achat
    const linesByPoId = new Map<number, any[]>();
    for (const line of purchaseOrderLines) {
      if (line && line.order_id) {
        const pId = Array.isArray(line.order_id) ? line.order_id[0] : line.order_id;
        if (typeof pId === 'number') {
          if (!linesByPoId.has(pId)) linesByPoId.set(pId, []);
          linesByPoId.get(pId)!.push(line);
        }
      }
    }

    // Résolution des libellés analytiques pour contextualiser chaque achat
    const analyticAccountNames = new Map<number, string>();
    const analyticIdsToResolve = new Set<number>();
    for (const po of eligiblePurchaseOrders) {
      if (po.analytic_account_id && Array.isArray(po.analytic_account_id)) {
        analyticIdsToResolve.add(po.analytic_account_id[0]);
      } else if (po.account_analytic_id && Array.isArray(po.account_analytic_id)) {
        analyticIdsToResolve.add(po.account_analytic_id[0]);
      }
    }
    for (const line of purchaseOrderLines) {
      const aId = Array.isArray(line.analytic_account_id) ? line.analytic_account_id[0]
        : (Array.isArray(line.account_analytic_id) ? line.account_analytic_id[0] : null);
      if (aId && typeof aId === 'number') analyticIdsToResolve.add(aId);
      if (line.analytic_distribution && typeof line.analytic_distribution === 'object') {
        const parsed = parseDistributionKeys(line.analytic_distribution);
        parsed.forEach(e => e.accountIds.forEach(id => analyticIdsToResolve.add(id)));
      }
    }

    if (analyticIdsToResolve.size > 0 && analyticFieldsSet.size > 0) {
      try {
        const accs = await this.executeKw(
          credentials,
          uid,
          'account.analytic.account',
          'search_read',
          [[['id', 'in', Array.from(analyticIdsToResolve)]]],
          { fields: ['id', 'name'], limit: analyticIdsToResolve.size }
        );
        if (Array.isArray(accs)) {
          accs.forEach(a => {
            if (a.id && a.name) analyticAccountNames.set(a.id, a.name);
          });
        }
      } catch (accErr: any) {
        console.warn('[WipInflow] Résolution account.analytic.account notice:', accErr?.message);
      }
    }

    // 5. CALCUL DE L'AUGMENTATION DE L'ENCOURS :
    // Pour chaque commande d'achat >= 500 € faite dans le mois :
    // - Calculer le montant engagé non encore facturé (ou le delta si facturation partielle)
    // - Exclure les achats déjà totalement facturés (invoice_status === 'invoiced' ou qty_invoiced >= product_qty)
    const orderItems: WipPurchasesInflowOrderItem[] = [];
    let globalPurchasesInflowUntaxed = 0;

    for (const po of eligiblePurchaseOrders) {
      const poLines = linesByPoId.get(po.id) || [];
      const poTotal = Number(po.amount_total !== undefined ? po.amount_total : (po.amount_untaxed || 0));
      const poUntaxed = Number(po.amount_untaxed !== undefined ? po.amount_untaxed : poTotal);

      // Si la commande est déjà 100% facturée par le fournisseur, delta = 0 (déjà sortie de l'encours)
      if (po.invoice_status === 'invoiced') {
        continue;
      }

      let poPendingUntaxed = 0;
      let validLinesCount = 0;
      let poAnalyticId: number | undefined;
      let poAnalyticName: string | undefined;

      if (po.analytic_account_id && Array.isArray(po.analytic_account_id)) {
        poAnalyticId = po.analytic_account_id[0];
        poAnalyticName = po.analytic_account_id[1] || analyticAccountNames.get(poAnalyticId);
      } else if (po.account_analytic_id && Array.isArray(po.account_analytic_id)) {
        poAnalyticId = po.account_analytic_id[0];
        poAnalyticName = po.account_analytic_id[1] || analyticAccountNames.get(poAnalyticId);
      }

      if (poLines.length > 0) {
        for (const line of poLines) {
          if (isExcludedPurchaseReference(line.name)) continue;

          const qtyOrdered = Number(line.product_qty !== undefined ? line.product_qty : (line.product_uom_qty || 0));
          const qtyInvoiced = Number(line.qty_invoiced || 0);
          const priceUnit = Number(line.price_unit || 0);
          const priceSubtotal = Number(line.price_subtotal !== undefined ? line.price_subtotal : (qtyOrdered * priceUnit));

          // Si déjà totalement facturé sur cette ligne, delta nul
          if (qtyInvoiced >= qtyOrdered && qtyOrdered > 0) {
            continue;
          }

          const qtyToInvoice = Math.max(0, qtyOrdered - qtyInvoiced);
          if (qtyToInvoice <= 0) continue;

          // Delta restant non encore facturé pour cette ligne
          const linePending = qtyOrdered > 0 ? (qtyToInvoice / qtyOrdered) * priceSubtotal : (qtyToInvoice * priceUnit);
          if (linePending > 0) {
            poPendingUntaxed += linePending;
            validLinesCount++;
          }

          // Déduire le compte analytique de la ligne si absent de l'entête
          if (!poAnalyticId) {
            const lAccId = Array.isArray(line.analytic_account_id) ? line.analytic_account_id[0]
              : (Array.isArray(line.account_analytic_id) ? line.account_analytic_id[0] : null);
            if (lAccId) {
              poAnalyticId = lAccId;
              poAnalyticName = analyticAccountNames.get(lAccId) || `Compte #${lAccId}`;
            } else if (line.analytic_distribution && typeof line.analytic_distribution === 'object') {
              const parsed = parseDistributionKeys(line.analytic_distribution);
              if (parsed.length > 0 && parsed[0].accountIds.length > 0) {
                poAnalyticId = parsed[0].accountIds[0];
                poAnalyticName = analyticAccountNames.get(poAnalyticId) || `Compte #${poAnalyticId}`;
              }
            }
          }
        }
      } else {
        // Si aucune ligne spécifique n'a pu être chargée
        if (po.invoice_status === 'no' || po.invoice_status === 'to invoice') {
          poPendingUntaxed = poUntaxed;
          validLinesCount = 1;
        }
      }

      poPendingUntaxed = Math.round(poPendingUntaxed * 100) / 100;

      // Seuls les achats avec un montant non encore facturé > 0 augmentent l'encours
      if (poPendingUntaxed > 0) {
        globalPurchasesInflowUntaxed += poPendingUntaxed;

        const supplier = Array.isArray(po.partner_id) ? po.partner_id[1] : (po.partner_id || 'Fournisseur');

        orderItems.push({
          orderId: po.id,
          orderName: po.name || `PO #${po.id}`,
          partnerName: supplier,
          supplierName: supplier,
          amountTotal: Math.round(poTotal * 100) / 100,
          amountUntaxed: Math.round(poUntaxed * 100) / 100,
          dateOrder: po.date_order || po.date_approve || '',
          analyticAccountId: poAnalyticId,
          analyticAccountName: poAnalyticName,
          saleOrderName: po.origin || undefined,
          invoiceStatus: po.invoice_status || 'to invoice',
          pendingPurchasesUntaxed: poPendingUntaxed,
          purchaseLinesCount: validLinesCount || 1
        });
      }
    }

    globalPurchasesInflowUntaxed = Math.round(globalPurchasesInflowUntaxed * 100) / 100;

    const monthNames = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    const monthIndex = parseInt(mo, 10) - 1;
    const selectedMonthLabel = `${monthNames[monthIndex] || mo} ${yr}`;

    const availableMonths = [
      { monthKey: '2026-09', monthLabel: 'Septembre 2026' },
      { monthKey: '2026-08', monthLabel: 'Août 2026' },
      { monthKey: '2026-07', monthLabel: 'Juillet 2026' },
      { monthKey: '2026-06', monthLabel: 'Juin 2026' }
    ];

    const result: WipPurchasesInflowReportResponse = {
      success: true,
      records: orderItems,
      summary: {
        selectedMonthKey,
        selectedMonthLabel,
        totalEligibleOrdersCount: orderItems.length,
        totalPurchaseOrdersCount: eligiblePurchaseOrders.length,
        totalExcludedUnder500Count,
        totalPurchasesInflowUntaxed: globalPurchasesInflowUntaxed,
        availableMonths
      },
      fromCache: false,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      isDemo: false
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Version Sandbox / Démo du rapport Augmentation de l'Encours
   * Règle stricte : Commandes d'achat >= 500 € faites dans le mois et non encore facturées.
   */
  public getMockWipPurchasesInflowReport(options: { monthKey?: string } = {}): WipPurchasesInflowReportResponse {
    const selectedMonthKey = options.monthKey ? String(options.monthKey).trim() : '2026-09';

    const monthDataMap: Record<string, {
      label: string;
      totalPurchasesInflowUntaxed: number;
      totalExcludedUnder500Count: number;
      orders: WipPurchasesInflowOrderItem[];
    }> = {
      '2026-09': {
        label: 'Septembre 2026',
        totalPurchasesInflowUntaxed: 34850.00,
        totalExcludedUnder500Count: 5, // 5 petites commandes d'achat < 500 € exclues
        orders: [
          {
            orderId: 341,
            orderName: 'PO/2026/00341',
            partnerName: 'Métallerie Dubois SAS',
            supplierName: 'Métallerie Dubois SAS',
            amountTotal: 6850.00,
            amountUntaxed: 5700.00,
            dateOrder: '2026-09-04 11:20:00',
            analyticAccountId: 250907,
            analyticAccountName: 'Affaire FMF250907',
            saleOrderName: 'FMF250907',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 3420.00,
            purchaseLinesCount: 1
          },
          {
            orderId: 345,
            orderName: 'PO/2026/00345',
            partnerName: 'Automatismes & Câblages IDF',
            supplierName: 'Automatismes & Câblages IDF',
            amountTotal: 18400.00,
            amountUntaxed: 15333.33,
            dateOrder: '2026-09-08 14:15:00',
            analyticAccountId: 1085,
            analyticAccountName: 'Ligne Robotisée Val-de-Loire',
            saleOrderName: 'SO/2026/00185',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 14500.00,
            purchaseLinesCount: 3
          },
          {
            orderId: 350,
            orderName: 'PO/2026/00350',
            partnerName: 'Tôlerie Précision 45',
            supplierName: 'Tôlerie Précision 45',
            amountTotal: 14880.00,
            amountUntaxed: 12400.00,
            dateOrder: '2026-09-12 09:30:00',
            analyticAccountId: 1082,
            analyticAccountName: 'Affaire SO/2026/00182',
            saleOrderName: 'SO/2026/00182',
            invoiceStatus: 'no',
            pendingPurchasesUntaxed: 12400.00,
            purchaseLinesCount: 2
          },
          {
            orderId: 355,
            orderName: 'PO/2026/00355',
            partnerName: 'Fournitures Industrielles Centre',
            supplierName: 'Fournitures Industrielles Centre',
            amountTotal: 5436.00,
            amountUntaxed: 4530.00,
            dateOrder: '2026-09-18 16:00:00',
            analyticAccountId: 1010,
            analyticAccountName: 'Projet Déploiement - Client XYZ',
            saleOrderName: 'SO042',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 4530.00,
            purchaseLinesCount: 2
          }
        ]
      },
      '2026-08': {
        label: 'Août 2026',
        totalPurchasesInflowUntaxed: 24350.00,
        totalExcludedUnder500Count: 3,
        orders: [
          {
            orderId: 312,
            orderName: 'PO/2026/00312',
            partnerName: 'Composants Médicaux Ouest',
            supplierName: 'Composants Médicaux Ouest',
            amountTotal: 15360.00,
            amountUntaxed: 12800.00,
            dateOrder: '2026-08-11 10:15:00',
            analyticAccountId: 1012,
            analyticAccountName: 'Conformité Dispositifs Médicaux',
            saleOrderName: 'SO/2026/00133',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 12800.00,
            purchaseLinesCount: 2
          },
          {
            orderId: 318,
            orderName: 'PO/2026/00318',
            partnerName: 'Équipements Logistique Sud',
            supplierName: 'Équipements Logistique Sud',
            amountTotal: 7128.00,
            amountUntaxed: 5940.00,
            dateOrder: '2026-08-18 15:45:00',
            analyticAccountId: 1013,
            analyticAccountName: 'Optimisation Entrepôt Sud',
            saleOrderName: 'SO/2026/00132',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 5940.00,
            purchaseLinesCount: 1
          },
          {
            orderId: 320,
            orderName: 'PO/2026/00320',
            partnerName: 'Matériel Réseau Novatech',
            supplierName: 'Matériel Réseau Novatech',
            amountTotal: 2220.00,
            amountUntaxed: 1850.00,
            dateOrder: '2026-08-25 09:20:00',
            analyticAccountId: 1011,
            analyticAccountName: 'Migration Infrastructure Novatech',
            saleOrderName: 'SO/2026/00134',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 1850.00,
            purchaseLinesCount: 1
          },
          {
            orderId: 325,
            orderName: 'PO/2026/00325',
            partnerName: 'Services Techniques Énergie',
            supplierName: 'Services Techniques Énergie',
            amountTotal: 4512.00,
            amountUntaxed: 3760.00,
            dateOrder: '2026-08-27 14:00:00',
            analyticAccountId: 1010,
            analyticAccountName: 'Projet Déploiement - Client XYZ',
            saleOrderName: 'SO042',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 3760.00,
            purchaseLinesCount: 1
          }
        ]
      },
      '2026-07': {
        label: 'Juillet 2026',
        totalPurchasesInflowUntaxed: 16900.00,
        totalExcludedUnder500Count: 4,
        orders: [
          {
            orderId: 280,
            orderName: 'PO/2026/00280',
            partnerName: 'Turbines & Composants Éoliens',
            supplierName: 'Turbines & Composants Éoliens',
            amountTotal: 11400.00,
            amountUntaxed: 9500.00,
            dateOrder: '2026-07-15 11:30:00',
            analyticAccountId: 1020,
            analyticAccountName: 'Parc Éolien Atlantique',
            saleOrderName: 'SO/2026/00120',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 9500.00,
            purchaseLinesCount: 2
          },
          {
            orderId: 285,
            orderName: 'PO/2026/00285',
            partnerName: 'Automates Pharmacie SAS',
            supplierName: 'Automates Pharmacie SAS',
            amountTotal: 8880.00,
            amountUntaxed: 7400.00,
            dateOrder: '2026-07-22 14:00:00',
            analyticAccountId: 1021,
            analyticAccountName: 'Robotisation Officine',
            saleOrderName: 'SO/2026/00121',
            invoiceStatus: 'to invoice',
            pendingPurchasesUntaxed: 7400.00,
            purchaseLinesCount: 1
          }
        ]
      }
    };

    const target = monthDataMap[selectedMonthKey] || {
      label: selectedMonthKey,
      totalPurchasesInflowUntaxed: 18500.00,
      totalExcludedUnder500Count: 2,
      orders: []
    };

    const availableMonths = [
      { monthKey: '2026-09', monthLabel: 'Septembre 2026' },
      { monthKey: '2026-08', monthLabel: 'Août 2026' },
      { monthKey: '2026-07', monthLabel: 'Juillet 2026' },
      { monthKey: '2026-06', monthLabel: 'Juin 2026' }
    ];

    return {
      success: true,
      records: target.orders,
      summary: {
        selectedMonthKey,
        selectedMonthLabel: target.label,
        totalEligibleOrdersCount: target.orders.length,
        totalPurchaseOrdersCount: target.orders.length,
        totalExcludedUnder500Count: target.totalExcludedUnder500Count,
        totalPurchasesInflowUntaxed: target.totalPurchasesInflowUntaxed,
        availableMonths
      },
      fromCache: false,
      executionTimeMs: 10,
      timestamp: new Date().toISOString(),
      isDemo: true
    };
  }
}

export const odooBackendService = new OdooBackendService();


