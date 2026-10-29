import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version: ${version ?? '<missing>'}`);
}

const manifestPath = new URL('../module.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
manifest.version = version;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
