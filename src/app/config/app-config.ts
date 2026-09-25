export type DataProvider = 'demo' | 'firebase';
export type FileProvider = 'demo' | 'r2';

/**
 * Global application configuration. Property branding is now tenant-specific and
 * stored under tenants/{tenantId}; these values are only safe fallbacks before login.
 */
export const APP_CONFIG = {
  dataProvider: 'firebase' as DataProvider,
  fileProvider: 'r2' as FileProvider,
  platform: {
    name: 'PG Ops',
    platformOwnerUid: 'ePgzejfMinUyvrWMtQe4C5gYwg73',
    platformOwnerName: 'Ananth Kumar',
    defaultTenantId: 'mana-pg',
  },
  property: {
    name: 'Sri Sai PG',
    shortName: 'PG Ops',
    domain: 'pg.picsecure.in',
    city: 'Vijayawada',
  },
  demo: {
    persistInBrowser: true,
    storageKey: 'pgops-demo-v7',
  },
  r2: {
    bucketName: 'mana-pg-management',
    apiBaseUrl: 'https://mana-pg-files.mana-pg.workers.dev',
    maxFileBytes: 15 * 1024 * 1024,
  },
} as const;
