import { odooBackendService } from './odooService';
import { SUPPORTED_MODELS, MODEL_FIELD_DEFINITIONS } from '../data/odooModels';

export interface OdooProxyRequest {
  action?: string;
  url?: string;
  db?: string;
  username?: string;
  apiKey?: string;
  isDemo?: boolean;
  model?: string;
  domain?: any[];
  fields?: string[];
  offset?: number;
  limit?: number;
  order?: string;
  forceRefresh?: boolean;
  credentials?: {
    url: string;
    db: string;
    username: string;
    apiKey: string;
  };
  asOfDate?: string;
  startDate?: string;
  endDate?: string;
  thresholdHours?: number;
  hideWeekends?: boolean;
  employeeIds?: number[];
  monthKey?: string;
}

/**
 * Universal Odoo Request Dispatcher
 * Handles all Odoo operations safely with 100% JSON output, structured error handling,
 * and zero reliance on client-side CORS.
 */
export async function handleOdooRequest(payload: OdooProxyRequest, actionOverride?: string): Promise<{
  status: number;
  body: any;
}> {
  const action = actionOverride || payload.action || 'unknown';

  // Normalize credentials from root or nested credentials object
  const credentials = payload.credentials || (payload.url && payload.db && payload.username && payload.apiKey ? {
    url: payload.url,
    db: payload.db,
    username: payload.username,
    apiKey: payload.apiKey
  } : undefined);

  const isDemo = Boolean(payload.isDemo);

  try {
    switch (action) {
      case 'health': {
        return {
          status: 200,
          body: {
            status: 'ok',
            time: new Date().toISOString(),
            platform: 'Vercel / Express Odoo Proxy'
          }
        };
      }

      case 'models': {
        return {
          status: 200,
          body: {
            success: true,
            models: SUPPORTED_MODELS
          }
        };
      }

      case 'test-connection':
      case 'test_connection': {
        if (isDemo) {
          return {
            status: 200,
            body: {
              success: true,
              uid: 2,
              serverVersion: 'Odoo 17.0 Enterprise (Sandbox)',
              serverVersionInfo: [17, 0, 0, 'final', 0, 'e'],
              companyName: 'My Company France & Benelux',
              latencyMs: 18,
              isDemo: true
            }
          };
        }

        if (!credentials || !credentials.url || !credentials.db || !credentials.username || !credentials.apiKey) {
          return {
            status: 400,
            body: {
              success: false,
              error: 'Veuillez renseigner tous les champs : URL de l\'instance, Base de données, Utilisateur et Clé API.'
            }
          };
        }

        const result = await odooBackendService.testConnection(credentials);
        if (!result.success) {
          const errorStr = odooBackendService.extractErrorMessage(result.error) || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL et vos identifiants.';
          return {
            status: 400,
            body: {
              success: false,
              error: errorStr,
              latencyMs: result.latencyMs
            }
          };
        }

        return {
          status: 200,
          body: {
            ...result,
            isDemo: false
          }
        };
      }

      case 'search-read':
      case 'search_read': {
        const model = payload.model;
        if (!model) {
          return {
            status: 400,
            body: {
              success: false,
              error: 'Paramètre "model" manquant (ex: sale.order).'
            }
          };
        }

        const domain = payload.domain || [];
        const fields = payload.fields || [];
        const offset = Number(payload.offset) || 0;
        const limit = Number(payload.limit) || 80;
        const order = payload.order || 'id desc';
        const forceRefresh = Boolean(payload.forceRefresh);

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockSearchRead(
            model,
            domain,
            fields,
            offset,
            limit,
            order
          );
          return {
            status: 200,
            body: {
              success: true,
              model,
              records: mockResult.records,
              totalCount: mockResult.totalCount,
              fields: mockResult.fields,
              fromCache: false,
              executionTimeMs: mockResult.executionTimeMs,
              timestamp: new Date().toISOString(),
              isDemo: true
            }
          };
        }

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

        return {
          status: 200,
          body: {
            success: true,
            model,
            records: result.records,
            totalCount: result.totalCount,
            fields: result.fields,
            fromCache: result.fromCache,
            executionTimeMs: result.executionTimeMs,
            timestamp: new Date().toISOString(),
            isDemo: false
          }
        };
      }

      case 'fields-get':
      case 'fields_get': {
        const model = payload.model;
        if (!model) {
          return {
            status: 400,
            body: { success: false, error: 'Paramètre "model" requis.' }
          };
        }

        if (isDemo || !credentials || !credentials.url) {
          const fields = MODEL_FIELD_DEFINITIONS[model] || {};
          return {
            status: 200,
            body: { success: true, model, fields }
          };
        }

        const authRes = await odooBackendService.testConnection(credentials);
        if (!authRes.success || !authRes.uid) {
          return {
            status: 400,
            body: {
              success: false,
              error: authRes.error || 'Impossible de s\'authentifier sur Odoo pour récupérer les champs.'
            }
          };
        }

        const fields = await odooBackendService.getModelFields(credentials, authRes.uid, model);
        return {
          status: 200,
          body: { success: true, model, fields }
        };
      }

      case 'clear-cache':
      case 'clear_cache': {
        odooBackendService.clearCache();
        return {
          status: 200,
          body: {
            success: true,
            message: 'Cache serveur Odoo vidé avec succès.'
          }
        };
      }

      case 'report/uninvoiced-orders':
      case 'uninvoiced-orders':
      case 'uninvoiced_orders': {
        const forceRefresh = Boolean(payload.forceRefresh);
        const asOfDate = payload.asOfDate;

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockUninvoicedOrdersReport(asOfDate);
          return {
            status: 200,
            body: {
              success: true,
              records: mockResult.records,
              totalCount: mockResult.totalCount,
              summary: mockResult.summary,
              fromCache: false,
              executionTimeMs: mockResult.executionTimeMs,
              timestamp: new Date().toISOString(),
              isDemo: true,
              asOfDate
            }
          };
        }

        const result = await odooBackendService.getUninvoicedOrdersReport(
          credentials,
          forceRefresh,
          asOfDate
        );

        return {
          status: 200,
          body: {
            success: true,
            records: result.records,
            totalCount: result.totalCount,
            summary: result.summary,
            fromCache: result.fromCache,
            executionTimeMs: result.executionTimeMs,
            timestamp: new Date().toISOString(),
            isDemo: false,
            asOfDate
          }
        };
      }

      case 'report/timesheets-audit':
      case 'timesheets-audit':
      case 'timesheets_audit': {
        const forceRefresh = Boolean(payload.forceRefresh);
        const startDate = payload.startDate;
        const endDate = payload.endDate;
        const thresholdHours = payload.thresholdHours ? Number(payload.thresholdHours) : 7.0;
        const hideWeekends = payload.hideWeekends !== false;
        const employeeIds = payload.employeeIds;

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockTimesheetsAuditReport({
            startDate,
            endDate,
            thresholdHours,
            hideWeekends,
            employeeIds
          });
          return {
            status: 200,
            body: {
              success: true,
              records: mockResult.records,
              totalCount: mockResult.totalCount,
              summary: mockResult.summary,
              fromCache: false,
              executionTimeMs: mockResult.executionTimeMs,
              timestamp: new Date().toISOString(),
              isDemo: true,
              startDate: mockResult.startDate,
              endDate: mockResult.endDate,
              thresholdHours: mockResult.thresholdHours,
              hideWeekends: mockResult.hideWeekends
            }
          };
        }

        const result = await odooBackendService.getTimesheetsAuditReport(
          credentials,
          {
            startDate,
            endDate,
            thresholdHours,
            hideWeekends,
            employeeIds,
            forceRefresh
          }
        );

        return {
          status: 200,
          body: {
            success: true,
            records: result.records,
            totalCount: result.totalCount,
            summary: result.summary,
            fromCache: result.fromCache,
            executionTimeMs: result.executionTimeMs,
            timestamp: new Date().toISOString(),
            isDemo: false,
            startDate: result.startDate,
            endDate: result.endDate,
            thresholdHours: result.thresholdHours,
            hideWeekends: result.hideWeekends
          }
        };
      }

      case 'report/mould-weight-check':
      case 'report/weight-check':
      case 'mould-weight-check':
      case 'weight-check': {
        const forceRefresh = Boolean(payload.forceRefresh);

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockMouldWeightCheckReport();
          return {
            status: 200,
            body: {
              success: true,
              records: mockResult.records,
              totalCount: mockResult.totalCount,
              summary: mockResult.summary,
              fromCache: false,
              executionTimeMs: mockResult.executionTimeMs,
              timestamp: new Date().toISOString(),
              isDemo: true
            }
          };
        }

        const result = await odooBackendService.getMouldWeightCheckReport(
          credentials,
          forceRefresh
        );

        return {
          status: 200,
          body: {
            success: true,
            records: result.records,
            totalCount: result.totalCount,
            summary: result.summary,
            fromCache: result.fromCache,
            executionTimeMs: result.executionTimeMs,
            timestamp: new Date().toISOString(),
            isDemo: false
          }
        };
      }

      case 'report/billing-summary':
      case 'report/billing':
      case 'billing-summary':
      case 'billing': {
        const forceRefresh = Boolean(payload.forceRefresh);

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockBillingReport();
          return {
            status: 200,
            body: {
              ...mockResult,
              isDemo: true
            }
          };
        }

        const result = await odooBackendService.getBillingReport(
          credentials,
          forceRefresh
        );

        return {
          status: 200,
          body: {
            ...result,
            isDemo: false
          }
        };
      }

      case 'report/wip-purchases-outflow':
      case 'report/wip-outflow':
      case 'wip-purchases-outflow':
      case 'wip-outflow': {
        const forceRefresh = Boolean(payload.forceRefresh);
        const monthKey = payload.monthKey ? String(payload.monthKey).trim() : undefined;

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockWipPurchasesOutflowReport({
            monthKey
          });
          return {
            status: 200,
            body: {
              ...mockResult,
              isDemo: true
            }
          };
        }

        const result = await odooBackendService.getWipPurchasesOutflowReport(
          credentials,
          {
            monthKey,
            forceRefresh
          }
        );

        return {
          status: 200,
          body: {
            ...result,
            isDemo: false
          }
        };
      }

      case 'report/wip-purchases-inflow':
      case 'report/wip-inflow':
      case 'wip-purchases-inflow':
      case 'wip-inflow': {
        const forceRefresh = Boolean(payload.forceRefresh);
        const monthKey = payload.monthKey ? String(payload.monthKey).trim() : undefined;

        if (isDemo || !credentials || !credentials.url) {
          const mockResult = odooBackendService.getMockWipPurchasesInflowReport({
            monthKey
          });
          return {
            status: 200,
            body: {
              ...mockResult,
              isDemo: true
            }
          };
        }

        const result = await odooBackendService.getWipPurchasesInflowReport(
          credentials,
          {
            monthKey,
            forceRefresh
          }
        );

        return {
          status: 200,
          body: {
            ...result,
            isDemo: false
          }
        };
      }

      default: {
        return {
          status: 400,
          body: {
            success: false,
            error: `Action Odoo non reconnue: "${action}". Actions valides: test-connection, search-read, fields-get, report/uninvoiced-orders, models, clear-cache, health.`
          }
        };
      }
    }
  } catch (err: any) {
    console.error(`[OdooProxy Error on action "${action}"]:`, err);
    return {
      status: 400,
      body: {
        success: false,
        error: err.message || 'Impossible de contacter le serveur Odoo. Vérifiez l\'URL et vos identifiants.',
        action,
        timestamp: new Date().toISOString()
      }
    };
  }
}
