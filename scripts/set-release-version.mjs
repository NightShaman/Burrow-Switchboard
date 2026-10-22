import fs from 'node:fs';
const version = process.argv[2];
const check = process.argv.includes('--check');
if (!/^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/.test(version || '')) throw new Error('version_invalid');
const manifest = JSON.parse(fs.readFileSync('burrow.mod.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (check) {
  if (manifest.version !== version || pkg.version !== version) throw new Error('version_mismatch');
} else {
  manifest.version = version; pkg.version = version;
  fs.writeFileSync('burrow.mod.json', `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}
