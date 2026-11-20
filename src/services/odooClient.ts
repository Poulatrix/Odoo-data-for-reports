import { 
  OdooConnectionCredentials, 
  OdooSearchReadResponse, 
  UninvoicedReportResponse,
  TimesheetAuditReportResponse,
  MouldWeightCheckReportResponse,
  BillingReportResponse,
  WipOutflowReportResponse,
  WipPurchasesInflowReportResponse
} from '../types/odoo';

/**
 * Robust JSON fetcher for Vercel / Express environments
 * Prevents "Unexpected token '<'" or "Unexpected token 'T'" by verifying response type and status
 */
async function safeFetchJson<T>(url: string, bodyPayload: any): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });
  } catch (netErr: any) {
    throw new Error(
      `Impossible de contacter le serveur Odoo (${netErr.message || 'Erreur réseau'}). Vérifiez votre connexion.`
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!isJson) {
    const rawText = await res.text();
    console.warn(`[SafeFetch] Non-JSON response received from ${url} (HTTP ${res.status}):`, rawText.slice(0, 150));
    
    if (rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE') || rawText.includes('<html')) {
      throw new Error(
        `Le serveur proxy ou Odoo a renvoyé une page HTML (HTTP ${res.status}). Vérifiez que l'URL Odoo est correcte et accessible.`
      );
    }
    
    throw new Error(
      rawText.slice(0, 200) || `Erreur serveur (HTTP ${res.status}). Impossible de contacter le serveur Odoo.`
    );
  }

  const data = await res.json();
  if (!res.ok) {
    let errorMsg = 'Erreur lors de la communication avec le serveur.';
    if (data?.error) {
      if (typeof data.error === 'string') {
        errorMsg = data.error;
      } else if (typeof data.error === 'object') {
        errorMsg = data.error.message || data.error.data?.message || JSON.stringify(data.error);
      }
    } else if (data?.message) {
      errorMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
    }
    throw new Error(errorMsg);
  }

  return data as T;
}

class OdooClientService {
  private inMemoryCreds: OdooConnectionCredentials | null = null;
  private inMemoryDemo: boolean = false;

  public setRuntimeCredentials(creds: OdooConnectionCredentials | null, isDemo: boolean = false) {
    this.inMemoryCreds = creds;
    this.inMemoryDemo = isDemo;
  }

  public getSavedCredentials(): OdooConnectionCredentials | null {
    return this.inMemoryCreds;
  }

  public saveCredentials(creds: OdooConnectionCredentials): void {
    this.inMemoryCreds = creds;
    this.inMemoryDemo = false;
  }

  public clearCredentials(): void {
    this.inMemoryCreds = null;
    this.inMemoryDemo = true;
  }

  public isDemoMode(): boolean {
    return this.inMemoryDemo;
  }

  public setDemoMode(isDemo: boolean): void {
    this.inMemoryDemo = isDemo;
  }

  // Test connection to Odoo via server proxy (Vercel Serverless / Express)
  public async testConnection(creds?: OdooConnectionCredentials, isDemo: boolean = false): Promise<{
    success: boolean;
    uid?: number;
    serverVersion?: string;
    serverVersionInfo?: any[];
    companyName?: string;
    latencyMs?: number;
    error?: string;
  }> {
    try {
      const payload = {
        action: 'test-connection',
        url: creds?.url,
        db: creds?.db,
        username: creds?.username,
        apiKey: creds?.apiKey,
        credentials: creds,
        isDemo
      };

      // Calls /api/odoo proxy
      const data = await safeFetchJson<{
        success: boolean;
        uid?: number;
        serverVersion?: string;
        serverVersionInfo?: any[];
        companyName?: string;
        latencyMs?: number;
        error?: string;
      }>('/api/odoo', payload);

      return data;
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL et vos identifiants.'
      };
    }
  }

  // Search & Read data from Odoo via server proxy
  public async searchRead(params: {
    model: string;
    domain?: any[];
    fields?: string[];
    offset?: number;
    limit?: number;
    order?: string;
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
  }): Promise<OdooSearchReadResponse> {
    try {
      const payload = {
        action: 'search-read',
        model: params.model,
        domain: params.domain || [],
        fields: params.fields || [],
        offset: params.offset || 0,
        limit: params.limit || 80,
        order: params.order || 'id desc',
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo
      };

      return await safeFetchJson<OdooSearchReadResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        model: params.model,
        records: [],
        totalCount: 0,
        fields: {},
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }

  // Clear Server Cache
  public async clearCache(): Promise<void> {
    try {
      await safeFetchJson('/api/odoo', { action: 'clear-cache' });
    } catch (e) {
      console.warn('Cache clear warning:', e);
    }
  }

  // Specialized Report: Bilan des Affaires à Facturer via server proxy
  public async getUninvoicedOrdersReport(params: {
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
    asOfDate?: string;
  }): Promise<UninvoicedReportResponse> {
    try {
      const payload = {
        action: 'report/uninvoiced-orders',
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo,
        asOfDate: params.asOfDate
      };

      return await safeFetchJson<UninvoicedReportResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        records: [],
        totalCount: 0,
        summary: {
          totalOrdersCount: 0,
          totalSalesUntaxed: 0,
          totalTimesheetHours: 0,
          totalPurchasesInvoiced: 0,
          totalGrossMargin: 0,
          averageMarginRate: 0,
          totalValuation77_76: 0,
          totalValuation90: 0
        },
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }

  // Specialized Report: Contrôle des Pointages / Suivi de la Saisie des Heures
  public async getTimesheetsAuditReport(params: {
    startDate?: string;
    endDate?: string;
    thresholdHours?: number;
    hideWeekends?: boolean;
    employeeIds?: number[];
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
  }): Promise<TimesheetAuditReportResponse> {
    try {
      const payload = {
        action: 'report/timesheets-audit',
        startDate: params.startDate,
        endDate: params.endDate,
        thresholdHours: params.thresholdHours,
        hideWeekends: params.hideWeekends,
        employeeIds: params.employeeIds,
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo
      };

      return await safeFetchJson<TimesheetAuditReportResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        records: [],
        totalCount: 0,
        summary: {
          totalEmployees: 0,
          employeesWithMissingDays: 0,
          employeesFullyCompliant: 0,
          totalMissingDays: 0,
          totalIncompleteDays: 0,
          totalRecordedHours: 0,
          totalExpectedHours: 0,
          overallComplianceRate: 0,
          businessDaysCount: 0,
          dateList: []
        },
        startDate: params.startDate || '',
        endDate: params.endDate || '',
        thresholdHours: params.thresholdHours || 7.0,
        hideWeekends: params.hideWeekends !== false,
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }

  // Specialized Report: Vérification du Poids (Moules Neufs)
  public async getMouldWeightCheckReport(params: {
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
  }): Promise<MouldWeightCheckReportResponse> {
    try {
      const payload = {
        action: 'report/mould-weight-check',
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo
      };

      return await safeFetchJson<MouldWeightCheckReportResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        records: [],
        totalCount: 0,
        summary: {
          totalOrdersCount: 0,
          totalProductsCount: 0,
          anomaliesCount: 0,
          compliantCount: 0,
          complianceRate: 100
        },
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }

  // Specialized Report: Bilan de la Facturation (Ventes & Achats)
  public async getBillingReport(params: {
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
  }): Promise<BillingReportResponse> {
    try {
      const payload = {
        action: 'report/billing-summary',
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo
      };

      return await safeFetchJson<BillingReportResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        monthlySummaries: [],
        dossiers: [],
        summary: {
          totalSalesUntaxed: 0,
          totalSalesTotal: 0,
          totalPurchasesUntaxed: 0,
          totalPurchasesTotal: 0,
          totalNetMarginUntaxed: 0,
          overallMarginRate: 0,
          totalSalesInvoicesCount: 0,
          totalPurchasesBillsCount: 0,
          totalDossiersCount: 0
        },
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }

  // Specialized Report: Sorties d'Encours Achats (Achats des Ventes Facturées)
  public async getWipPurchasesOutflowReport(params: {
    monthKey?: string;
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
  }): Promise<WipOutflowReportResponse> {
    try {
      const payload = {
        action: 'report/wip-purchases-outflow',
        monthKey: params.monthKey,
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo
      };

      return await safeFetchJson<WipOutflowReportResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        records: [],
        summary: {
          selectedMonthKey: params.monthKey || '',
          selectedMonthLabel: params.monthKey || '',
          totalInvoicesCount: 0,
          totalOrdersCount: 0,
          totalInvoicedSalesUntaxed: 0,
          totalPurchasesOutflowUntaxed: 0,
          totalGrossMarginUntaxed: 0,
          overallMarginRate: 0,
          availableMonths: []
        },
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }

  // Specialized Report / Widget: Augmentation de l'Encours (Achats engagés non facturés du mois)
  public async getWipPurchasesInflowReport(params: {
    monthKey?: string;
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
  }): Promise<WipPurchasesInflowReportResponse> {
    try {
      const payload = {
        action: 'report/wip-purchases-inflow',
        monthKey: params.monthKey,
        forceRefresh: params.forceRefresh || false,
        credentials: params.credentials,
        isDemo: params.isDemo
      };

      return await safeFetchJson<WipPurchasesInflowReportResponse>('/api/odoo', payload);
    } catch (err: any) {
      return {
        success: false,
        records: [],
        summary: {
          selectedMonthKey: params.monthKey || '',
          selectedMonthLabel: params.monthKey || '',
          totalEligibleOrdersCount: 0,
          totalPurchasesInflowUntaxed: 0,
          availableMonths: []
        },
        timestamp: new Date().toISOString(),
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL.'
      };
    }
  }
}

export const odooClient = new OdooClientService();
