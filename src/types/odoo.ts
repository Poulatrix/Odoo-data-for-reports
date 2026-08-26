export type OdooFieldType = 
  | 'char' 
  | 'text' 
  | 'html' 
  | 'integer' 
  | 'float' 
  | 'monetary' 
  | 'boolean' 
  | 'selection' 
  | 'date' 
  | 'datetime' 
  | 'many2one' 
  | 'one2many' 
  | 'many2many' 
  | 'binary';

export interface OdooFieldDefinition {
  name: string;
  string: string;
  type: OdooFieldType;
  required?: boolean;
  readonly?: boolean;
  help?: string;
  selection?: [string | number, string][];
  relation?: string;
  defaultVisible?: boolean;
}

export interface OdooModelConfig {
  id: string; // e.g. 'sale.order'
  name: string; // e.g. 'Commandes de vente'
  technicalName: string;
  category: 'Ventes' | 'Comptabilité' | 'Contacts' | 'Achats' | 'CRM' | 'Inventaire' | 'Projets';
  icon: string;
  description: string;
  defaultFields: string[];
  defaultSort: { field: string; direction: 'asc' | 'desc' };
  statusField?: string;
  amountField?: string;
  partnerField?: string;
  dateField?: string;
  stateBadgeMap?: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }>;
}

export interface OdooConnectionCredentials {
  url: string;
  db: string;
  username: string;
  apiKey: string;
  protocol?: 'xmlrpc' | 'jsonrpc';
}

export interface OdooConnectionState {
  isConnected: boolean;
  isDemoMode: boolean;
  credentials?: OdooConnectionCredentials;
  userInfo?: {
    uid: number;
    name: string;
    serverVersion?: string;
    serverVersionInfo?: (string | number)[];
    companyName?: string;
  };
  lastChecked?: string;
  latencyMs?: number;
}

export interface OdooSearchReadPayload {
  model: string;
  domain?: (string | number | boolean | any[])[];
  fields?: string[];
  offset?: number;
  limit?: number;
  order?: string;
  useCache?: boolean;
  forceRefresh?: boolean;
  credentials?: OdooConnectionCredentials;
  isDemo?: boolean;
}

export interface OdooSearchReadResponse {
  success: boolean;
  model: string;
  records: Record<string, any>[];
  totalCount: number;
  fields: Record<string, OdooFieldDefinition>;
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  error?: string;
  details?: string;
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: '=' | '!=' | 'ilike' | 'not ilike' | '>' | '>=' | '<' | '<=' | 'in' | 'not in' | 'set' | 'not_set';
  value: any;
}

export interface TimesheetDetailItem {
  id: number;
  name: string;
  unit_amount: number;
  effective_hours?: number;
  date: string;
  user_id?: [number, string] | false;
  employee_id?: [number, string] | false;
  account_id?: [number, string] | false;
  task_id?: [number, string] | false;
  product_uom_id?: [number, string] | false;
  amount?: number;
}

export interface VendorBillLineDetailItem {
  id: number;
  name: string;
  ref?: string;
  move_id?: [number, string] | false;
  partner_id?: [number, string] | false;
  price_subtotal: number;
  debit?: number;
  credit?: number;
  date: string;
  parent_state: string;
  analytic_account_id?: [number, string] | false;
}

export interface ManualAnalyticLineDetailItem {
  id: number;
  name: string;
  amount: number;
  rawAmount: number;
  date: string;
  user_id?: [number, string] | false;
  employee_id?: [number, string] | false;
  account_id?: [number, string] | false;
  project_id?: [number, string] | false;
  task_id?: [number, string] | false;
  product_uom_id?: [number, string] | false;
  unit_amount?: number;
  category?: string;
  move_line_id?: [number, string] | false;
  partner_id?: [number, string] | false;
  ref?: string;
}

export interface UninvoicedOrderReportItem {
  id: number;
  name: string;
  partner_id: [number, string];
  clientDisplay: string;
  amount_untaxed: number;
  amount_total: number;
  date_order: string;
  user_id?: [number, string] | false;
  analytic_account_id?: [number, string] | false;
  project_id?: [number, string] | false;
  state: 'sale' | string;
  invoice_status: 'to invoice' | string;
  totalHours: number;
  totalPurchases: number;
  vendorBillsTotal?: number;
  manualAnalyticCostsTotal?: number;
  grossMargin: number;
  marginRate: number;
  hourlyMarginRate?: number;
  valuation77_76: number;
  valuation90: number;
  timesheets: TimesheetDetailItem[];
  vendorBills: VendorBillLineDetailItem[];
  manualAnalyticLines?: ManualAnalyticLineDetailItem[];
}

export interface UninvoicedReportResponse {
  success: boolean;
  records: UninvoicedOrderReportItem[];
  totalCount: number;
  summary: {
    totalOrdersCount: number;
    totalSalesUntaxed: number;
    totalTimesheetHours: number;
    totalPurchasesInvoiced: number;
    totalVendorBills?: number;
    totalManualAnalyticCosts?: number;
    totalGrossMargin: number;
    averageMarginRate: number;
    totalValuation77_76?: number;
    totalValuation90?: number;
  };
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  isDemo?: boolean;
  error?: string;
}


export interface TableSortState {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ModelKPISummary {
  totalRecords: number;
  filteredRecords: number;
  totalAmount?: number;
  averageAmount?: number;
  statusBreakdown?: { label: string; count: number; percentage: number; color: string }[];
  currencySymbol: string;
}
