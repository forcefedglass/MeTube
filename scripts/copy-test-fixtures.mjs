/**
 * Copies tests/fixtures/** into dist-test/tests/fixtures so compiled test
 * code can read captured real-page fixtures at runtime.
 */
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'tests', 'fixtures');
const dest = join(root, 'dist-test', 'tests', 'fixtures');

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });