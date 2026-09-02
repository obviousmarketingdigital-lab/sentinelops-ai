import { createFileSystemSource, type ProjectSource } from './project-source';

const BULK_ADVISORY_ENDPOINT = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';

/** The bulk endpoint rejects very large payloads, so the tree is capped. */
const MAX_PACKAGES = 800;

export interface Vulnerability {
  id: string;
  packageName: string;
  installedVersion: string;
  severity: 'Critical' | 'High' | 'Moderate' | 'Low';
  cveId?: string;
  title: string;
  vulnerableVersions: string;
  fixedIn: string;
  advisoryUrl?: string;
}

export interface SecurityScanResult {
  ok: boolean;
  scannedAt: string;
  source: 'npm-registry-advisories';
  packagesScanned: number;
  vulnerabilities: Vulnerability[];
  /** Populated when the scan could not run; vulnerabilities is then empty. */
  error?: string;
}

interface BulkAdvisory {
  id?: number | string;
  title?: string;
  severity?: string;
  vulnerable_versions?: string;
  cves?: string[];
  url?: string;
}

function normalizeSeverity(raw?: string): Vulnerability['severity'] {
  switch ((raw ?? '').toLowerCase()) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'low':
      return 'Low';
    default:
      return 'Moderate';
  }
}

/**
 * Collects the installed dependency tree from package-lock.json.
 * Keys look like "node_modules/next" or "node_modules/a/node_modules/b".
 */
async function readInstalledPackages(
  source: ProjectSource,
): Promise<{ packages: Record<string, string[]>; count: number } | null> {
  const raw = await source.read('package-lock.json');
  if (raw === null) return null;

  let lock: { packages?: Record<string, { version?: string }> };
  try {
    lock = JSON.parse(raw);
  } catch {
    return null;
  }

  const packages: Record<string, Set<string>> = {};
  let count = 0;

  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.includes('node_modules/') || !entry?.version) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!name) continue;
    if (!packages[name]) packages[name] = new Set();
    if (!packages[name].has(entry.version)) {
      packages[name].add(entry.version);
      count += 1;
    }
    if (count >= MAX_PACKAGES) break;
  }

  return {
    packages: Object.fromEntries(Object.entries(packages).map(([name, versions]) => [name, [...versions]])),
    count,
  };
}

/**
 * Queries the public npm advisory database for the dependency tree actually
 * installed in this project. Requires network access; when it is unavailable
 * the result reports the failure instead of returning placeholder findings.
 */
export async function performSecurityScan(
  source: ProjectSource = createFileSystemSource(),
): Promise<SecurityScanResult> {
  const scannedAt = new Date().toISOString();
  const base: SecurityScanResult = {
    ok: false,
    scannedAt,
    source: 'npm-registry-advisories',
    packagesScanned: 0,
    vulnerabilities: [],
  };

  const installed = await readInstalledPackages(source);
  if (!installed || installed.count === 0) {
    return {
      ...base,
      error:
        'package-lock.json was not found or contains no resolved packages, so there is no dependency tree to scan.',
    };
  }

  let payload: Record<string, BulkAdvisory[]>;
  try {
    const response = await fetch(BULK_ADVISORY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(installed.packages),
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ...base,
        packagesScanned: installed.count,
        error: `npm advisory endpoint returned ${response.status} ${response.statusText}.`,
      };
    }

    payload = (await response.json()) as Record<string, BulkAdvisory[]>;
  } catch (error) {
    return {
      ...base,
      packagesScanned: installed.count,
      error: `Could not reach the npm advisory endpoint: ${(error as Error).message}`,
    };
  }

  const vulnerabilities: Vulnerability[] = [];
  for (const [packageName, advisories] of Object.entries(payload)) {
    for (const advisory of advisories ?? []) {
      vulnerabilities.push({
        id: String(advisory.id ?? `${packageName}-${vulnerabilities.length}`),
        packageName,
        installedVersion: (installed.packages[packageName] ?? []).join(', '),
        severity: normalizeSeverity(advisory.severity),
        cveId: advisory.cves?.[0],
        title: advisory.title ?? 'Advisory without a title',
        vulnerableVersions: advisory.vulnerable_versions ?? 'unknown',
        fixedIn: 'see advisory',
        advisoryUrl: advisory.url,
      });
    }
  }

  const order: Record<Vulnerability['severity'], number> = {
    Critical: 0,
    High: 1,
    Moderate: 2,
    Low: 3,
  };
  vulnerabilities.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    ok: true,
    scannedAt,
    source: 'npm-registry-advisories',
    packagesScanned: installed.count,
    vulnerabilities,
  };
}
