import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const runtimeRoots = ['app', 'components', 'lib'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md']);

async function collectRuntimeSourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRuntimeSourceFiles(absolute));
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }

  return files;
}

describe('CONAGS branding integrity', () => {
  it('contains no legacy brand token in runtime-facing source', async () => {
    const fileGroups = await Promise.all(
      runtimeRoots.map((root) => collectRuntimeSourceFiles(path.resolve(process.cwd(), root))),
    );
    const files = fileGroups.flat();
    const offenders: string[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const legacyBrand = 'BIM' + 'ED';
      if (new RegExp('\\b' + legacyBrand + '\\b', 'i').test(content)) offenders.push(path.relative(process.cwd(), file));
    }

    if (offenders.length > 0) throw new Error('Legacy brand token found in: ' + offenders.join(', '));
  });
});
