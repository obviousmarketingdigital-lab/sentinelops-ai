export interface Vulnerability {
  id: string;
  packageName: string;
  severity: 'Critical' | 'High' | 'Moderate' | 'Low';
  cveId?: string;
  description: string;
  fixedIn: string;
}

export function performSecurityScan(): Vulnerability[] {
  return [
    {
      id: 'vuln_101',
      packageName: 'lodash',
      severity: 'High',
      cveId: 'CVE-2020-8203',
      description: 'Prototype pollution vulnerability in lodash before 4.17.20 allows attackers to inject properties.',
      fixedIn: '4.17.21'
    },
    {
      id: 'vuln_102',
      packageName: 'next',
      severity: 'Moderate',
      cveId: 'CVE-2024-3434',
      description: 'Potential Server-Side Request Forgery (SSRF) in specific Next.js dynamic routing patterns.',
      fixedIn: '16.3.3'
    },
    {
      id: 'vuln_103',
      packageName: 'axios',
      severity: 'Critical',
      cveId: 'CVE-2023-45857',
      description: 'Cross-site request forgery and header injection in axios prior to 1.6.0.',
      fixedIn: '1.7.4'
    },
    {
      id: 'vuln_104',
      packageName: 'express',
      severity: 'Moderate',
      cveId: 'CVE-2024-29041',
      description: 'Open redirect vulnerability in express static middleware handler.',
      fixedIn: '4.19.2'
    }
  ];
}
