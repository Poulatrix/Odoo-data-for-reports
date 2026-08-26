import { 
  OdooConnectionCredentials, 
  OdooConnectionState, 
  OdooSearchReadResponse,
  OdooFieldDefinition,
  UninvoicedReportResponse
} from '../types/odoo';

const STORAGE_KEY_CREDS = 'odoo_saas_credentials_v1';
const STORAGE_KEY_DEMO = 'odoo_saas_is_demo_v1';

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

  // Test connection to Odoo backend API
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
      const res = await fetch('/api/odoo/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: creds?.url,
          db: creds?.db,
          username: creds?.username,
          apiKey: creds?.apiKey,
          isDemo
        })
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erreur réseau lors de la communication avec le serveur SaaS.'
      };
    }
  }

  // Search & Read data from Odoo
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
      const res = await fetch('/api/odoo/search-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.model,
          domain: params.domain || [],
          fields: params.fields || [],
          offset: params.offset || 0,
          limit: params.limit || 80,
          order: params.order || 'id desc',
          forceRefresh: params.forceRefresh || false,
          credentials: params.credentials,
          isDemo: params.isDemo
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur HTTP ${res.status}`);
      }

      const data: OdooSearchReadResponse = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        model: params.model,
        records: [],
        totalCount: 0,
        fields: {},
        timestamp: new Date().toISOString(),
        error: err.message || 'Erreur de récupération des données'
      };
    }
  }

  // Clear Server Cache
  public async clearCache(): Promise<void> {
    await fetch('/api/odoo/clear-cache', { method: 'POST' });
  }

  // Specialized Report: Bilan des Affaires à Facturer
  public async getUninvoicedOrdersReport(params: {
    forceRefresh?: boolean;
    credentials?: OdooConnectionCredentials;
    isDemo?: boolean;
    asOfDate?: string;
  }): Promise<UninvoicedReportResponse> {
    try {
      const res = await fetch('/api/odoo/report/uninvoiced-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceRefresh: params.forceRefresh || false,
          credentials: params.credentials,
          isDemo: params.isDemo,
          asOfDate: params.asOfDate
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur HTTP ${res.status}`);
      }

      return await res.json();
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
        error: err.message || 'Erreur lors du calcul du rapport des affaires à facturer.'
      };
    }
  }
}

export const odooClient = new OdooClientService();

