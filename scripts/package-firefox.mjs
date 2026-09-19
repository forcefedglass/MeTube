#!/usr/bin/env node
/**
 * Package the Firefox build (dist-firefox/) into metube-firefox.xpi.
 * An .xpi is a zip; store method, manifest first (Firefox accepts either
 * order but manifest-first is the convention).
 *
 * Dev-install note: the xpi is unsigned. Firefox requires
 * xpinstall.signatures.required=false (dev/unbranded builds) — see
 * METUBE_CONTEXT.md and README.md for the exact steps.
 */

import { createReadStream, createWriteStream, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist-firefox');
const outFile = join(root, 'metube-firefox.xpi');

if (!existsSync(join(distDir, 'manifest.json'))) {
  console.error('dist-firefox/manifest.json missing — run `npm run build:firefox` first.');
  process.exit(1);
}

// Minimal deterministic zip writer (store method, CRC32) so the build has
// no dependency on the `zip` CLI being installed.
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

class ByteWriter extends Writable {
  constructor() {
    super();
    this.chunks = [];
  }
  _write(chunk, _enc, cb) {
    this.chunks.push(Buffer.from(chunk));
    cb();
  }
  buffer() {
    return Buffer.concat(this.chunks);
  }
}

async function toBuffer(stream) {
  const w = new ByteWriter();
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    w.on('error', reject);
    w.on('finish', resolve);
    stream.pipe(w);
  });
  return w.buffer();
}

function dosDateTime(d) {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

function storeEntry(name, content, when) {
  const { time, date } = dosDateTime(when);
  const crc = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header signature
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // method: store
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28); // extra len
  return {
    name,
    crc,
    local: Buffer.concat([local, Buffer.from(name, 'utf8'), content]),
    offset: 0,
    size: content.length,
    time,
    date,
  };
}

function centralRecord(entry) {
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4); // version made by
  c.writeUInt16LE(20, 6); // version needed
  c.writeUInt16LE(0, 8);
  c.writeUInt16LE(0, 10); // store
  c.writeUInt16LE(entry.time, 12);
  c.writeUInt16LE(entry.date, 14);
  c.writeUInt32LE(entry.crc, 16);
  c.writeUInt32LE(entry.size, 20);
  c.writeUInt32LE(entry.size, 24);
  c.writeUInt16LE(entry.name.length, 28);
  c.writeUInt16LE(0, 30); // extra
  c.writeUInt16LE(0, 32); // comment
  c.writeUInt16LE(0, 34); // disk number
  c.writeUInt16LE(0, 36); // internal attrs
  c.writeUInt32LE(0, 38); // external attrs
  c.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([c, Buffer.from(entry.name, 'utf8')]);
}

const when = new Date();
const files = readdirSync(distDir)
  .filter((f) => statSync(join(distDir, f)).isFile())
  .sort();
// manifest first, then the rest deterministically.
const ordered = [
  'manifest.json',
  ...files.filter((f) => f !== 'manifest.json'),
];

const out = createWriteStream(outFile);
let offset = 0;
const entries = [];
for (const name of ordered) {
  const buf = await toBuffer(createReadStreamSafe(join(distDir, name)));
  const entry = storeEntry(name, buf, when);
  entry.offset = offset;
  offset += entry.local.length;
  await write(out, entry.local);
  entries.push(entry);
}
const centralStart = offset;
for (const e of entries) {
  const rec = centralRecord(e);
  await write(out, rec);
  offset += rec.length;
}
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(offset - centralStart, 12);
end.writeUInt32LE(centralStart, 16);
end.writeUInt16LE(0, 20);
await write(out, end);
await new Promise((resolve) => out.end(resolve));
console.log(`Packaged ${entries.length} file(s) -> ${outFile}`);

function write(stream, buf) {
  return new Promise((resolve, reject) => {
    stream.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

function createReadStreamSafe(p) {
  return createReadStream(p);
}