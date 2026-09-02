import fs from 'fs/promises';
import path from 'path';

/**
 * Stores which findings already produced a pull request.
 *
 * This is a JSON file on the container filesystem, which is ephemeral on most
 * hosts: every deploy and every restart discards it. SENTINEL_DATA_DIR points
 * the file at a mounted volume where one is available. Anything that must
 * survive a restart belongs in a database, not here.
 */
const DATA_DIR = process.env.SENTINEL_DATA_DIR ?? path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'sentinel-fixes.json');

export type AppliedFixes = Record<string, string>;

export async function getAppliedFixes(): Promise<AppliedFixes> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data) as AppliedFixes;
  } catch {
    return {};
  }
}

export async function applyFix(id: string, prUrl: string): Promise<AppliedFixes> {
  const fixes = await getAppliedFixes();
  fixes[id] = prUrl;
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(fixes, null, 2));
  return fixes;
}

/** True when writes are expected to survive a restart. */
export function isStorageDurable(): boolean {
  return !!process.env.SENTINEL_DATA_DIR;
}
