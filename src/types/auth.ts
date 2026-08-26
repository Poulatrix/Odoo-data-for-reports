import { OdooConnectionCredentials } from './odoo';

export interface UserSettings {
  userId: string;
  url?: string;
  db?: string;
  username?: string;
  apiKey?: string;
  isConfigured?: boolean;
  columnPreferences?: Record<string, string[]>;
  lastConnectedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
}
