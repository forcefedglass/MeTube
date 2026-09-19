#!/usr/bin/env node
/**
 * Build the MeTube extension.
 *   1. esbuild bundles src/extension/content.ts -> <outDir>/content.js
 *   2. writes a target-specific manifest.json into <outDir>/
 *
 * Targets:
 *   --target chromium (default) -> dist/   (loadable unpacked MV3 extension)
 *   --target firefox            -> dist-firefox/ (loadable as unsigned XPI
 *        in a dev profile, see METUBE_CONTEXT.md)
 *
 * The Firefox manifest adds `browser_specific_settings.gecko.id` (required
 * for XPI installs; the key is ignored by Chromium so the targets stay
 * behaviorally identical otherwise).
 */

import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcExt = join(root, 'src', 'extension');
const targetFlag = process.argv.find((a) => a.startsWith('--target='));
const target = targetFlag ? targetFlag.split('=')[1] : 'chromium';

if (target !== 'chromium' && target !== 'firefox') {
  throw new Error(`Unknown build target: ${target} (use chromium|firefox)`);
}

const outDir = target === 'firefox' ? join(root, 'dist-firefox') : join(root, 'dist');
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(srcExt, 'content.ts')],
  bundle: true,
  minify: false,
  format: 'iife',
  // ESM-safe output target: Firefox and Chromium both run this as a
  // classic content script; ES2020 keeps output readable and compatible.
  target: 'es2020',
  outfile: join(outDir, 'content.js'),
  legalComments: 'none',
  logLevel: 'info',
});

const sourceManifest = JSON.parse(
  readFileSync(join(srcExt, 'manifest.json'), 'utf8'),
);

let manifest = { ...sourceManifest };
if (target === 'firefox') {
  manifest = {
    ...manifest,
    browser_specific_settings: {
      gecko: {
        id: 'metube@metube.local',
        // Firefox ESR range this build is validated against.
        strict_min_version: '115.0',
      },
    },
  };
}

const required = ['manifest_version', 'name', 'version', 'content_scripts'];
const missing = required.filter((k) => !(k in manifest));
if (manifest.manifest_version !== 3) {
  throw new Error('manifest_version must be 3');
}
if (missing.length > 0) {
  throw new Error(`manifest.json missing keys: ${missing.join(', ')}`);
}
if (target === 'firefox' && !manifest.browser_specific_settings?.gecko?.id) {
  throw new Error('firefox target requires browser_specific_settings.gecko.id');
}
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`MeTube extension built (${target}) -> ${join(outDir)}`);