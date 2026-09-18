#!/usr/bin/env node
/**
 * Build the MeTube extension into dist/.
 *   1. esbuild bundles src/extension/content.ts -> dist/content.js
 *   2. copies manifest.json + static assets -> dist/
 * Output is a loadable Chromium MV3 unpacked extension.
 */

import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');
const srcExt = join(root, 'src', 'extension');

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(srcExt, 'content.ts')],
  bundle: true,
  minify: false,
  format: 'iife',
  target: 'chrome120',
  outfile: join(outDir, 'content.js'),
  legalComments: 'none',
  logLevel: 'info',
});

copyFileSync(join(srcExt, 'manifest.json'), join(outDir, 'manifest.json'));

const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
const required = ['manifest_version', 'name', 'version', 'content_scripts'];
const missing = required.filter((k) => !(k in manifest));
if (manifest.manifest_version !== 3) {
  throw new Error('manifest_version must be 3');
}
if (missing.length > 0) {
  throw new Error(`manifest.json missing keys: ${missing.join(', ')}`);
}
console.log('MeTube extension built -> dist/');