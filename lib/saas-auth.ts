export interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  monthlyQuota: number;
  scansUsed: number;
  createdAt: string;
}

export function getMockOrganization(slug = 'default-org'): Organization {
  return {
    id: 'org_001',
    name: 'Obvious Marketing Digital Lab',
    slug,
    tier: 'PRO',
    monthlyQuota: 500,
    scansUsed: 42,
    createdAt: new Date().toISOString()
  };
}

export function checkQuota(org: Organization): boolean {
  return org.scansUsed < org.monthlyQuota;
}
