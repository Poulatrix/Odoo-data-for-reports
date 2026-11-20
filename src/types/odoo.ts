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
  id: number | string;
  name: string;
  ref?: string;
  move_id?: [number, string] | false;
  purchase_line_id?: [number, string] | false;
  partner_id?: [number, string] | false;
  price_subtotal: number;
  original_price_subtotal?: number;
  prorata_percentage?: number;
  analytic_distribution?: any;
  debit?: number;
  credit?: number;
  date: string;
  parent_state: string;
  analytic_account_id?: [number, string] | false;
}

export interface ManualAnalyticLineDetailItem {
  id: number | string;
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
  purchase_line_id?: [number, string] | false;
  partner_id?: [number, string] | false;
  ref?: string;
}

export interface PurchaseOrderLineDetailItem {
  id: number | string;
  name: string;
  order_id?: [number, string] | false;
  order_name?: string;
  partner_id?: [number, string] | false;
  product_id?: [number, string] | false;
  product_qty: number;
  qty_invoiced: number;
  qty_to_invoice: number;
  price_unit: number;
  price_subtotal: number;
  amount_to_invoice: number;
  original_amount_to_invoice?: number;
  prorata_percentage?: number;
  date_order?: string;
  date_approve?: string;
  state?: string;
  analytic_account_id?: [number, string] | false;
  analytic_distribution?: any;
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
  purchaseOrdersPending?: number;
  purchaseOrdersPendingTotal?: number;
  totalCommittedCosts?: number;
  grossMargin: number;
  marginRate: number;
  hourlyMarginRate?: number;
  valuation77_76: number;
  valuation90: number;
  timesheets: TimesheetDetailItem[];
  vendorBills: VendorBillLineDetailItem[];
  manualAnalyticLines?: ManualAnalyticLineDetailItem[];
  purchaseOrderLines?: PurchaseOrderLineDetailItem[];
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
    totalPurchaseOrdersPending?: number;
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

// ----------------------------------------------------
// TYPES POUR LE SUIVI ET CONTRÔLE DES POINTAGES (TIMESHEETS)
// ----------------------------------------------------

export type TimesheetDayStatusType = 'missing' | 'incomplete' | 'ok' | 'weekend' | 'future' | 'excluded' | 'today';

export type TimesheetExclusionReason = 'conge' | 'maladie' | 'ferie' | 'valide' | 'autre';

export type TimesheetComplianceStatus = 'OK' | 'NOK' | 'CHECK';

export interface TimesheetExclusion {
  id: string; // `${employeeId}_${date}`
  employeeId: number;
  employeeName?: string;
  date: string; // 'YYYY-MM-DD'
  reason: TimesheetExclusionReason;
  comment?: string;
  createdAt: string;
}

export interface TimesheetWorkgroup {
  id: string;
  name: string;
  description?: string;
  employeeIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetDayLineDetail {
  id: number;
  name: string;
  projectName?: string;
  taskName?: string;
  unitAmount: number;
  date: string;
}

export interface TimesheetDayEntry {
  date: string; // 'YYYY-MM-DD'
  formattedDate: string; // 'Lun 25/08'
  dayOfWeek: number; // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  isWeekend: boolean;
  hours: number;
  status: TimesheetDayStatusType;
  isExcluded?: boolean;
  isValidated?: boolean;
  exclusionReason?: TimesheetExclusionReason;
  exclusionComment?: string;
  lines: TimesheetDayLineDetail[];
}

export interface TimesheetAuditEmployeeItem {
  id: number;
  name: string;
  userId?: [number, string] | false;
  workEmail?: string;
  departmentName?: string;
  jobTitle?: string;
  avatarUrl?: string;
  totalHours: number;
  expectedHours: number;
  businessDaysCount: number;
  missingDaysCount: number;
  incompleteDaysCount: number;
  okDaysCount: number;
  excludedDaysCount?: number;
  complianceRate: number; // 0 - 100%
  complianceStatus: TimesheetComplianceStatus; // 'OK' | 'NOK' | 'CHECK'
  missingDates: string[]; // ['2026-08-25', '2026-08-26']
  incompleteDates: string[]; // ['2026-08-27']
  excludedDates?: string[];
  lastRecordedDate?: string;
  lastRecordedHours?: number;
  lastRecordedTask?: string;
  days: Record<string, TimesheetDayEntry>; // key: 'YYYY-MM-DD'
}

export interface TimesheetAuditSummary {
  totalEmployees: number;
  employeesWithMissingDays: number;
  employeesFullyCompliant: number;
  totalMissingDays: number;
  totalIncompleteDays: number;
  totalRecordedHours: number;
  totalExpectedHours: number;
  overallComplianceRate: number;
  businessDaysCount: number;
  dateList: {
    date: string; // 'YYYY-MM-DD'
    formattedDate: string; // 'Lun 25/08'
    shortDay: string; // 'Lun 25'
    dayOfWeek: number;
    isWeekend: boolean;
  }[];
}

export interface TimesheetAuditReportResponse {
  success: boolean;
  records: TimesheetAuditEmployeeItem[];
  totalCount: number;
  summary: TimesheetAuditSummary;
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  isDemo?: boolean;
  error?: string;
  startDate: string;
  endDate: string;
  thresholdHours: number;
  hideWeekends: boolean;
}

// ----------------------------------------------------
// Specialized Report: Vérification du Poids (Moules Neufs)
// ----------------------------------------------------
export type MouldWeightStatus = 'ANOMALIE' | 'CONFORME';

export interface MouldWeightCheckItem {
  id: string; // unique key `${orderId}_${lineId}_${productId}`
  orderId: number;
  orderName: string; // N° Commande e.g. 'SO/2026/00142'
  clientOrderRef?: string;
  orderDate?: string;
  partnerId: number;
  partnerName: string; // Client
  lineId: number;
  lineName?: string;
  productId: number;
  productName: string; // Article / Moule
  productDefaultCode?: string; // Référence interne
  productTmplId?: number;
  tagNames: string[]; // Étiquette e.g. ['Moule neuf']
  tagDisplay: string;
  weight: number; // in kg (0 if missing/null/0)
  hasWeight: boolean; // weight > 0
  status: MouldWeightStatus; // 'ANOMALIE' | 'CONFORME'
  statusLabel: string; // "Poids manquant (0 kg)" | "Poids renseigné (X kg)"
  odooProductUrl?: string; // Direct link to Odoo product sheet
  odooOrderUrl?: string; // Direct link to Odoo sale order
}

export interface MouldWeightCheckSummary {
  totalOrdersCount: number;
  totalProductsCount: number;
  anomaliesCount: number; // weight == 0 or missing
  compliantCount: number; // weight > 0
  complianceRate: number; // e.g. 75 (%)
}

export interface MouldWeightCheckReportResponse {
  success: boolean;
  records: MouldWeightCheckItem[];
  totalCount: number;
  summary: MouldWeightCheckSummary;
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  isDemo?: boolean;
  error?: string;
}

// ----------------------------------------------------
// Bilan de la Facturation (Ventes & Achats)
// ----------------------------------------------------

export interface MonthlyBillingSummaryItem {
  monthKey: string; // '2026-08'
  monthLabel: string; // 'Août 2026'
  shortLabel: string; // 'Août 26'
  year: number;
  month: number; // 1 - 12
  // Ventes
  salesUntaxed: number;
  salesTotal: number;
  salesCount: number;
  salesDossiersCount: number;
  // Achats
  purchasesUntaxed: number;
  purchasesTotal: number;
  purchasesCount: number;
  purchasesDossiersCount: number;
  // Marge
  netMarginUntaxed: number; // salesUntaxed - purchasesUntaxed
  marginRate: number; // %
}

export interface InvoicedDossierItem {
  id: number;
  moveType: 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund' | string;
  category: 'sale' | 'purchase';
  name: string; // N° Pièce e.g. 'INV/2026/00098'
  dossierRef: string; // N° Commande / Dossier e.g. 'SO/2026/00141'
  clientOrderRef?: string;
  partnerId: number;
  partnerName: string;
  invoiceDate: string; // 'YYYY-MM-DD'
  dueDate?: string;
  monthKey: string; // '2026-08'
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  state: 'posted' | 'draft' | 'cancel' | string;
  paymentState: 'paid' | 'not_paid' | 'partial' | 'in_payment' | string;
  commercialUser?: string;
  odooInvoiceUrl?: string;
  odooOrderUrl?: string;
  lineCount?: number;
}

export interface BillingReportSummary {
  totalSalesUntaxed: number;
  totalSalesTotal: number;
  totalPurchasesUntaxed: number;
  totalPurchasesTotal: number;
  totalNetMarginUntaxed: number;
  overallMarginRate: number;
  totalSalesInvoicesCount: number;
  totalPurchasesBillsCount: number;
  totalDossiersCount: number;
}

export interface BillingReportResponse {
  success: boolean;
  monthlySummaries: MonthlyBillingSummaryItem[];
  dossiers: InvoicedDossierItem[];
  summary: BillingReportSummary;
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  isDemo?: boolean;
  error?: string;
}

// ----------------------------------------------------
// Rapport Sorties d'Encours : Achats des Ventes Facturées
// ----------------------------------------------------

export interface WipPurchaseDetailItem {
  id: number;
  type: 'vendor_bill' | 'purchase_order' | 'analytic_line' | string;
  typeLabel: string; // 'Facture Fournisseur' | 'Bon de Commande' | 'Ligne Analytique'
  reference: string; // N° Pièce e.g. 'BILL/2026/00045' ou 'PO/2026/00055'
  partnerId?: number;
  partnerName: string; // Fournisseur
  date: string; // 'YYYY-MM-DD'
  productLabel: string; // Description de l'article ou de la prestation
  amountUntaxed: number; // Montant HT (€)
  state?: string;
  projectId?: number;
  projectName?: string;
  odooUrl?: string;
}

export interface WipOutflowInvoiceItem {
  id: number; // invoiceId
  invoiceNumber: string; // 'INV/2026/00098'
  invoiceDate: string; // 'YYYY-MM-DD'
  monthKey: string; // 'YYYY-MM'
  saleOrderId?: number;
  saleOrderName: string; // 'SO/2026/00141'
  projectId?: number;
  projectName?: string;
  analyticAccountId?: number;
  analyticAccountName?: string;
  partnerId: number;
  partnerName: string; // Client
  clientOrderRef?: string;
  commercialUser?: string;
  invoicedSalesUntaxed: number; // Total Vente Facturée (€ HT)
  invoicedSalesTotal: number; // Total Vente TTC (€)
  attachedPurchasesUntaxed: number; // Total Achats Rattachés Sortis de l'Encours (€ HT)
  grossMarginUntaxed: number; // Marge Brute (€ HT) = Ventes - Achats
  grossMarginRate: number; // Taux de Marge Brute (%)
  purchasesCount: number;
  purchaseDetails: WipPurchaseDetailItem[]; // Détail des pièces d'achat
  odooInvoiceUrl?: string;
  odooOrderUrl?: string;
}

export interface WipOutflowAvailableMonth {
  monthKey: string; // '2026-09'
  monthLabel: string; // 'Septembre 2026'
  year: number;
  month: number;
  invoicesCount: number;
  totalSalesUntaxed: number;
  totalPurchasesUntaxed: number;
}

export interface WipOutflowReportSummary {
  selectedMonthKey: string;
  selectedMonthLabel: string;
  totalInvoicesCount: number;
  totalOrdersCount: number;
  totalInvoicedSalesUntaxed: number;
  totalPurchasesOutflowUntaxed: number; // "Total des achats sortis de l'encours sur le mois"
  totalGrossMarginUntaxed: number;
  overallMarginRate: number;
  availableMonths: WipOutflowAvailableMonth[];
}

export interface WipOutflowReportResponse {
  success: boolean;
  records: WipOutflowInvoiceItem[];
  summary: WipOutflowReportSummary;
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  isDemo?: boolean;
  error?: string;
}

// ----------------------------------------------------
// Rapport / Widget : Augmentation de l'Encours (Achats engagés non facturés du mois)
// ----------------------------------------------------

export interface WipPurchasesInflowOrderItem {
  orderId: number; // ID Commande d'Achat (purchase.order)
  orderName: string; // Réf Commande d'Achat (ex: PO/2026/00341)
  partnerName: string; // Nom Fournisseur
  supplierName?: string; // Alias Fournisseur
  amountTotal: number; // Montant total commande d'achat (>= 500 €)
  amountUntaxed: number; // Montant total HT
  dateOrder: string; // Date de commande d'achat
  analyticAccountId?: number;
  analyticAccountName?: string;
  saleOrderName?: string; // Commande de vente ou affaire liée si existante
  invoiceStatus?: string; // Statut de facturation fournisseur ('no', 'to invoice', etc.)
  pendingPurchasesUntaxed: number; // Part non encore facturée (Montant commandé - montant déjà facturé)
  purchaseLinesCount: number;
}

export interface WipPurchasesInflowSummary {
  selectedMonthKey: string; // '2026-09'
  selectedMonthLabel: string; // 'Septembre 2026'
  totalEligibleOrdersCount: number; // Nombre de commandes d'achat >= 500 € retenues
  totalPurchaseOrdersCount?: number; // Total commandes d'achat éligibles >= 500 €
  totalExcludedUnder500Count?: number; // Total commandes d'achat < 500 € exclues
  totalPurchasesInflowUntaxed: number; // "Total Achats en Cours du mois : X XXX,XX €"
  availableMonths: { monthKey: string; monthLabel: string }[];
}

export interface WipPurchasesInflowReportResponse {
  success: boolean;
  records?: WipPurchasesInflowOrderItem[];
  summary: WipPurchasesInflowSummary;
  fromCache?: boolean;
  executionTimeMs?: number;
  timestamp: string;
  isDemo?: boolean;
  error?: string;
}
