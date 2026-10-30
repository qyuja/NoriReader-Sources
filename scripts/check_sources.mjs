import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script, runInNewContext} from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const packages = ['index.js', 'novels.js', 'cloud-drives.js', 'example-novel.js', 'example-source.js'];
const entries = ['index.config.js', 'novels.config.js', 'cloud-drives.config.js', 'example-novel.config.js'];
const manifests = new Map();

function evaluate(filename, expression) {
  const code = readFileSync(join(root, filename), 'utf8');
  assert(Buffer.byteLength(code) <= 512 * 1024, `${filename}: exceeds the App's source size limit`);
  return runInNewContext(`${code}\n${expression}`, {}, {timeout: 1000, filename});
}

for (const directory of ['', 'src']) {
  for (const filename of readdirSync(join(root, directory)).filter(name => name.endsWith('.js'))) {
    new Script(readFileSync(join(root, directory, filename), 'utf8'), {filename: join(directory, filename)});
  }
}

for (const filename of packages) {
  const source = evaluate(filename, 'source');
  const manifest = source.manifest;
  assert([1, 2].includes(manifest.apiVersion), `${filename}: unsupported source API version`);
  assert(manifest.id && manifest.name && manifest.version, `${filename}: missing source identity`);
  assert(Array.isArray(manifest.domains) && Array.isArray(manifest.sites), `${filename}: missing domains/sites`);
  const siteIDs = manifest.sites.map(site => site.id);
  const driveIDs = (manifest.drives || []).map(drive => drive.id);
  assert.equal(new Set(siteIDs).size, siteIDs.length, `${filename}: duplicate site IDs`);
  assert.equal(new Set(driveIDs).size, driveIDs.length, `${filename}: duplicate drive IDs`);
  for (const site of manifest.sites) {
    assert.equal(new URL(site.homepage).protocol, 'https:', `${filename}: non-HTTPS homepage`);
    for (const capability of site.capabilities) {
      const callback = capability === 'resources' ? 'detail'
        : capability === 'search' && site.capabilities.includes('catalog') ? 'catalog' : capability;
      assert.equal(typeof source[callback], 'function', `${filename}: missing ${callback} callback`);
    }
  }
  manifests.set(filename, manifest);
  console.log(`${filename}: ${manifest.id} ${manifest.version}; ${siteIDs.length} sites, ${driveIDs.length} drives`);
}

const base = new URL('https://raw.githubusercontent.com/qyuja/NoriReader-Sources/main/');
for (const filename of entries) {
  const config = evaluate(filename, 'sourceConfig');
  assert.equal(config.apiVersion, 1, `${filename}: unsupported configuration API version`);
  const target = new URL(config.script, new URL(filename, base));
  assert(target.href.startsWith(base.href), `${filename}: script must reference this repository`);
  const manifest = manifests.get(target.href.slice(base.href.length));
  assert(manifest, `${filename}: referenced script is not a published package`);
  if (config.defaultSite) {
    assert(manifest.sites.some(site => site.id === config.defaultSite), `${filename}: invalid default site`);
  }
}

console.log('Source syntax, manifests and configuration links checked.');
