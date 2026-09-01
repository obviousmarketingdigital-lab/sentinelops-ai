import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'sentinel-fixes.json');

export async function getAppliedFixes() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function applyFix(id: string, prUrl: string) {
  const fixes = await getAppliedFixes();
  fixes[id] = prUrl;
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(fixes, null, 2));
  return fixes;
}
