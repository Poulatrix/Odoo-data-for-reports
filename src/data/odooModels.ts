import { OdooModelConfig, OdooFieldDefinition } from '../types/odoo';

export const SUPPORTED_MODELS: OdooModelConfig[] = [
  {
    id: 'sale.order',
    name: 'Commandes de Vente',
    technicalName: 'sale.order',
    category: 'Ventes',
    icon: 'ShoppingCart',
    description: 'Devis commerciaux, bons de commande clients et montants facturés',
    defaultFields: ['name', 'date_order', 'partner_id', 'user_id', 'amount_untaxed', 'amount_total', 'state', 'invoice_status'],
    defaultSort: { field: 'date_order', direction: 'desc' },
    statusField: 'state',
    amountField: 'amount_total',
    partnerField: 'partner_id',
    dateField: 'date_order',
    stateBadgeMap: {
      draft: { label: 'Devis', variant: 'info' },
      sent: { label: 'Devis envoyé', variant: 'purple' },
      sale: { label: 'Bon de commande', variant: 'success' },
      done: { label: 'Verrouillé', variant: 'default' },
      cancel: { label: 'Annulé', variant: 'danger' }
    }
  },
  {
    id: 'account.move',
    name: 'Factures & Avoirs',
    technicalName: 'account.move',
    category: 'Comptabilité',
    icon: 'FileText',
    description: 'Factures clients, factures fournisseurs, écritures comptables et paiements',
    defaultFields: ['name', 'partner_id', 'invoice_date', 'invoice_date_due', 'move_type', 'amount_total', 'amount_residual', 'state', 'payment_state'],
    defaultSort: { field: 'invoice_date', direction: 'desc' },
    statusField: 'payment_state',
    amountField: 'amount_total',
    partnerField: 'partner_id',
    dateField: 'invoice_date',
    stateBadgeMap: {
      not_paid: { label: 'Non payé', variant: 'danger' },
      in_payment: { label: 'En paiement', variant: 'warning' },
      paid: { label: 'Payé', variant: 'success' },
      partial: { label: 'Partiellement payé', variant: 'warning' },
      reversed: { label: 'Extourné', variant: 'default' },
      draft: { label: 'Brouillon', variant: 'info' },
      posted: { label: 'Comptabilisé', variant: 'success' },
      cancel: { label: 'Annulé', variant: 'danger' }
    }
  },
  {
    id: 'res.partner',
    name: 'Contacts & Clients',
    technicalName: 'res.partner',
    category: 'Contacts',
    icon: 'Users',
    description: 'Clients, fournisseurs, sociétés et contacts individuels avec coordonnées',
    defaultFields: ['name', 'is_company', 'email', 'phone', 'city', 'country_id', 'category_id', 'total_invoiced', 'credit'],
    defaultSort: { field: 'name', direction: 'asc' },
    amountField: 'total_invoiced',
    stateBadgeMap: {
      customer: { label: 'Client', variant: 'success' },
      supplier: { label: 'Fournisseur', variant: 'purple' },
      lead: { label: 'Prospect', variant: 'info' }
    }
  },
  {
    id: 'purchase.order',
    name: 'Commandes Fournisseurs',
    technicalName: 'purchase.order',
    category: 'Achats',
    icon: 'Package',
    description: 'Demandes de prix, bons de commande d\'achats et réceptions fournisseurs',
    defaultFields: ['name', 'partner_id', 'date_order', 'date_planned', 'user_id', 'amount_untaxed', 'amount_total', 'state'],
    defaultSort: { field: 'date_order', direction: 'desc' },
    statusField: 'state',
    amountField: 'amount_total',
    partnerField: 'partner_id',
    dateField: 'date_order',
    stateBadgeMap: {
      draft: { label: 'Demande de prix', variant: 'info' },
      sent: { label: 'DP envoyée', variant: 'purple' },
      to_approve: { label: 'À approuver', variant: 'warning' },
      purchase: { label: 'Bon de commande', variant: 'success' },
      done: { label: 'Verrouillé', variant: 'default' },
      cancel: { label: 'Annulé', variant: 'danger' }
    }
  },
  {
    id: 'crm.lead',
    name: 'Opportunités CRM',
    technicalName: 'crm.lead',
    category: 'CRM',
    icon: 'TrendingUp',
    description: 'Pipeline commercial, leads entrants, valeur estimée et probabilité de closing',
    defaultFields: ['name', 'partner_id', 'contact_name', 'email_from', 'user_id', 'expected_revenue', 'probability', 'stage_id', 'priority'],
    defaultSort: { field: 'expected_revenue', direction: 'desc' },
    statusField: 'stage_id',
    amountField: 'expected_revenue',
    partnerField: 'partner_id',
    stateBadgeMap: {
      nouveau: { label: 'Nouveau', variant: 'info' },
      qualifie: { label: 'Qualifié', variant: 'purple' },
      proposition: { label: 'Proposition', variant: 'warning' },
      gagne: { label: 'Gagné', variant: 'success' },
      perdu: { label: 'Perdu', variant: 'danger' }
    }
  },
  {
    id: 'product.template',
    name: 'Articles & Produits',
    technicalName: 'product.template',
    category: 'Inventaire',
    icon: 'Boxes',
    description: 'Catalogue produits, prix de vente, coût standard, stock et variantes',
    defaultFields: ['name', 'default_code', 'list_price', 'standard_price', 'qty_available', 'categ_id', 'type', 'active'],
    defaultSort: { field: 'name', direction: 'asc' },
    amountField: 'list_price',
    stateBadgeMap: {
      consu: { label: 'Consommable', variant: 'info' },
      service: { label: 'Service', variant: 'purple' },
      product: { label: 'Stockable', variant: 'success' }
    }
  }
];

export const MODEL_FIELD_DEFINITIONS: Record<string, Record<string, OdooFieldDefinition>> = {
  'sale.order': {
    id: { name: 'id', string: 'ID Odoo', type: 'integer', readonly: true },
    name: { name: 'name', string: 'Numéro de Commande', type: 'char', required: true, defaultVisible: true },
    date_order: { name: 'date_order', string: 'Date de commande', type: 'datetime', defaultVisible: true },
    partner_id: { name: 'partner_id', string: 'Client', type: 'many2one', relation: 'res.partner', defaultVisible: true },
    partner_invoice_id: { name: 'partner_invoice_id', string: 'Adresse de facturation', type: 'many2one', relation: 'res.partner' },
    partner_shipping_id: { name: 'partner_shipping_id', string: 'Adresse de livraison', type: 'many2one', relation: 'res.partner' },
    user_id: { name: 'user_id', string: 'Vendeur / Commercial', type: 'many2one', relation: 'res.users', defaultVisible: true },
    team_id: { name: 'team_id', string: 'Équipe commerciale', type: 'many2one', relation: 'crm.team' },
    company_id: { name: 'company_id', string: 'Société', type: 'many2one', relation: 'res.company' },
    amount_untaxed: { name: 'amount_untaxed', string: 'Montant HT (€)', type: 'monetary', defaultVisible: true },
    amount_tax: { name: 'amount_tax', string: 'TVA (€)', type: 'monetary' },
    amount_total: { name: 'amount_total', string: 'Montant TTC (€)', type: 'monetary', defaultVisible: true },
    state: {
      name: 'state',
      string: 'Statut',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['draft', 'Devis'],
        ['sent', 'Devis envoyé'],
        ['sale', 'Bon de commande'],
        ['done', 'Verrouillé'],
        ['cancel', 'Annulé']
      ]
    },
    invoice_status: {
      name: 'invoice_status',
      string: 'État de facturation',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['upselling', 'Opportunité de vente incitative'],
        ['invoiced', 'Entièrement facturé'],
        ['to invoice', 'À facturer'],
        ['no', 'Rien à facturer']
      ]
    },
    validity_date: { name: 'validity_date', string: 'Date d\'expiration', type: 'date' },
    client_order_ref: { name: 'client_order_ref', string: 'Référence client / PO', type: 'char' },
    note: { name: 'note', string: 'Conditions & Notes', type: 'text' }
  },
  'account.move': {
    id: { name: 'id', string: 'ID Odoo', type: 'integer', readonly: true },
    name: { name: 'name', string: 'Numéro de Facture', type: 'char', required: true, defaultVisible: true },
    partner_id: { name: 'partner_id', string: 'Partenaire / Client', type: 'many2one', relation: 'res.partner', defaultVisible: true },
    invoice_date: { name: 'invoice_date', string: 'Date de facturation', type: 'date', defaultVisible: true },
    invoice_date_due: { name: 'invoice_date_due', string: 'Date d\'échéance', type: 'date', defaultVisible: true },
    move_type: {
      name: 'move_type',
      string: 'Type de pièce',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['out_invoice', 'Facture Client'],
        ['out_refund', 'Avoir Client'],
        ['in_invoice', 'Facture Fournisseur'],
        ['in_refund', 'Avoir Fournisseur'],
        ['entry', 'Pièce diverse']
      ]
    },
    amount_untaxed: { name: 'amount_untaxed', string: 'Montant HT (€)', type: 'monetary' },
    amount_total: { name: 'amount_total', string: 'Montant Total (€)', type: 'monetary', defaultVisible: true },
    amount_residual: { name: 'amount_residual', string: 'Reste à payer (€)', type: 'monetary', defaultVisible: true },
    state: {
      name: 'state',
      string: 'Statut écriture',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['draft', 'Brouillon'],
        ['posted', 'Comptabilisé'],
        ['cancel', 'Annulé']
      ]
    },
    payment_state: {
      name: 'payment_state',
      string: 'État du paiement',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['not_paid', 'Non payé'],
        ['in_payment', 'En paiement'],
        ['paid', 'Payé'],
        ['partial', 'Partiel'],
        ['reversed', 'Extourné']
      ]
    },
    invoice_user_id: { name: 'invoice_user_id', string: 'Responsable', type: 'many2one', relation: 'res.users' },
    ref: { name: 'ref', string: 'Référence / Libellé', type: 'char' }
  },
  'res.partner': {
    id: { name: 'id', string: 'ID Odoo', type: 'integer', readonly: true },
    name: { name: 'name', string: 'Nom du Contact / Société', type: 'char', required: true, defaultVisible: true },
    is_company: { name: 'is_company', string: 'Est une société', type: 'boolean', defaultVisible: true },
    parent_id: { name: 'parent_id', string: 'Société parente', type: 'many2one', relation: 'res.partner' },
    email: { name: 'email', string: 'Adresse Email', type: 'char', defaultVisible: true },
    phone: { name: 'phone', string: 'Téléphone', type: 'char', defaultVisible: true },
    mobile: { name: 'mobile', string: 'Mobile', type: 'char' },
    street: { name: 'street', string: 'Rue', type: 'char' },
    city: { name: 'city', string: 'Ville', type: 'char', defaultVisible: true },
    zip: { name: 'zip', string: 'Code postal', type: 'char' },
    country_id: { name: 'country_id', string: 'Pays', type: 'many2one', relation: 'res.country', defaultVisible: true },
    vat: { name: 'vat', string: 'Numéro TVA intra', type: 'char' },
    total_invoiced: { name: 'total_invoiced', string: 'Total facturé (€)', type: 'monetary', defaultVisible: true },
    credit: { name: 'credit', string: 'Créance client (€)', type: 'monetary', defaultVisible: true },
    user_id: { name: 'user_id', string: 'Commercial dédié', type: 'many2one', relation: 'res.users' }
  },
  'purchase.order': {
    id: { name: 'id', string: 'ID Odoo', type: 'integer', readonly: true },
    name: { name: 'name', string: 'Numéro Bon d\'Achat', type: 'char', required: true, defaultVisible: true },
    partner_id: { name: 'partner_id', string: 'Fournisseur', type: 'many2one', relation: 'res.partner', defaultVisible: true },
    date_order: { name: 'date_order', string: 'Date de commande', type: 'datetime', defaultVisible: true },
    date_planned: { name: 'date_planned', string: 'Date prévue de réception', type: 'datetime', defaultVisible: true },
    user_id: { name: 'user_id', string: 'Acheteur', type: 'many2one', relation: 'res.users', defaultVisible: true },
    amount_untaxed: { name: 'amount_untaxed', string: 'Montant HT (€)', type: 'monetary', defaultVisible: true },
    amount_total: { name: 'amount_total', string: 'Montant Total (€)', type: 'monetary', defaultVisible: true },
    state: {
      name: 'state',
      string: 'Statut',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['draft', 'Demande de prix'],
        ['sent', 'DP envoyée'],
        ['to_approve', 'À approuver'],
        ['purchase', 'Bon de commande'],
        ['done', 'Verrouillé'],
        ['cancel', 'Annulé']
      ]
    },
    partner_ref: { name: 'partner_ref', string: 'Réf. Fournisseur', type: 'char' }
  },
  'crm.lead': {
    id: { name: 'id', string: 'ID Odoo', type: 'integer', readonly: true },
    name: { name: 'name', string: 'Opportunité / Sujet', type: 'char', required: true, defaultVisible: true },
    partner_id: { name: 'partner_id', string: 'Client lié', type: 'many2one', relation: 'res.partner', defaultVisible: true },
    contact_name: { name: 'contact_name', string: 'Nom du contact', type: 'char', defaultVisible: true },
    email_from: { name: 'email_from', string: 'Email', type: 'char', defaultVisible: true },
    phone: { name: 'phone', string: 'Téléphone', type: 'char' },
    user_id: { name: 'user_id', string: 'Commercial', type: 'many2one', relation: 'res.users', defaultVisible: true },
    expected_revenue: { name: 'expected_revenue', string: 'Revenu espéré (€)', type: 'monetary', defaultVisible: true },
    probability: { name: 'probability', string: 'Probabilité (%)', type: 'float', defaultVisible: true },
    stage_id: { name: 'stage_id', string: 'Étape Pipeline', type: 'many2one', relation: 'crm.stage', defaultVisible: true },
    priority: {
      name: 'priority',
      string: 'Priorité',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['0', 'Normale'],
        ['1', 'Faible'],
        ['2', 'Haute'],
        ['3', 'Très haute']
      ]
    }
  },
  'product.template': {
    id: { name: 'id', string: 'ID Odoo', type: 'integer', readonly: true },
    name: { name: 'name', string: 'Nom de l\'article', type: 'char', required: true, defaultVisible: true },
    default_code: { name: 'default_code', string: 'Référence interne (SKU)', type: 'char', defaultVisible: true },
    list_price: { name: 'list_price', string: 'Prix de vente (€)', type: 'monetary', defaultVisible: true },
    standard_price: { name: 'standard_price', string: 'Coût d\'achat (€)', type: 'monetary', defaultVisible: true },
    qty_available: { name: 'qty_available', string: 'Quantité en stock', type: 'float', defaultVisible: true },
    categ_id: { name: 'categ_id', string: 'Catégorie d\'article', type: 'many2one', relation: 'product.category', defaultVisible: true },
    type: {
      name: 'type',
      string: 'Type d\'article',
      type: 'selection',
      defaultVisible: true,
      selection: [
        ['consu', 'Consommable'],
        ['service', 'Service'],
        ['product', 'Stockable']
      ]
    },
    active: { name: 'active', string: 'Actif', type: 'boolean', defaultVisible: true }
  }
};
