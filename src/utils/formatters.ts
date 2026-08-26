import { OdooFieldDefinition } from '../types/odoo';

export function formatCurrency(value: number | null | undefined, currency: string = 'EUR'): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00 €';
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals !== undefined ? decimals : 0,
    maximumFractionDigits: decimals !== undefined ? decimals : 2
  }).format(value);
}

export function formatDate(dateString: string | null | undefined, includeTime: boolean = false): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString.replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(dateString);

    if (includeTime) {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(d);
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  } catch (e) {
    return String(dateString);
  }
}

export function getMany2OneDisplay(val: any): { id: number | null; name: string } {
  if (!val) return { id: null, name: '—' };
  if (Array.isArray(val) && val.length >= 2) {
    return { id: val[0], name: String(val[1]) };
  }
  if (typeof val === 'object' && val.name) {
    return { id: val.id || null, name: String(val.name) };
  }
  return { id: null, name: String(val) };
}

export function getSelectionDisplay(val: any, fieldDef?: OdooFieldDefinition): string {
  if (val === undefined || val === null) return '—';
  if (fieldDef?.selection && Array.isArray(fieldDef.selection)) {
    const match = fieldDef.selection.find(item => item[0] === val);
    if (match) return match[1];
  }
  return String(val);
}
