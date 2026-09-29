#!/usr/bin/env node
// dsh-session-version.mjs — inspect and switch DSH session log format versions.
//
//   list                                          inventory every session: generations present, active one, age
//   probe  --id ID [--gen N]                      decode one generational file and print header/version/rows
//   convert --to <N> [--id ID | --all] [--write]  re-encode a session into generation N (kernel-backed, forward only)
//   hide    --gen <N> [--id ID | --all] [--write] make the runtime fall back to generation N (true downgrade)
//   show    --gen <N> [--id ID | --all] [--write] undo a hide
//
// Safety: dry-run unless --write. Never modifies a source generation. Never overwrites a
// generation written in the last 120 s (a live session is still appending to it) unless
// --force is given.
//
// Naming (the kernel's canonical form — v0 has NO ".v0" in its name):
//   v0 -> session.jsonl.zstd        vN -> session.vN.jsonl.zstd        hidden -> <file>.hidden-generation
// The runtime picks the numerically highest generation it recognises; a hidden file does
// not parse as a session log at all, so it simply drops out of the running.
//
// Honest capability boundary (the kernel's own frozen codecs decide it):
//   * v2 and v3 expose an ENCODER.  v0 and v1 expose only a DECODER  -> cannot be written.
//   * The catalog composes FORWARD migration edges only (0->1, 1->2, 2->3); there is no
//     reverse edge, so v3 -> v2 is not convertible.  Use `hide` instead: the older
//     generation is usually still on disk, and hiding the newer one is lossless.
//   * Encodable targets:      v0/v1/v2 -> v2 or v3        v3 -> v3 only
//   * Practical downgrade:    `hide --gen <newer>`        (lossless, verified against
//     the runtime's own parseSessionFormatLogFilename, which rejects the hidden name)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// 本文件随插件发布，位置是 <runtime>/dsh/node_modules/dsh-fenggu/tools/ ，
// 所以 ../.. 正好是运行时的 node_modules —— 不再写死 Program Files 路径。
const BASE = new URL('../../@deepseek-ai/', import.meta.url).href.replace(/\/$/, '');
const fmtMod = await import(BASE + '/dsh-session-format/lib/index.js');
const shipped = (await import(BASE + '/dsh-session-format-catalog/lib/index.js')).sessionFormatCatalog;
const e01 = await import(BASE + '/dsh-session-format-v0-to-v1/lib/index.js');
const e12 = await import(BASE + '/dsh-session-format-v1-to-v2/lib/index.js');
const e23 = await import(BASE + '/dsh-session-format-v2-to-v3/lib/index.js');

const ROOT = path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.dsh'), 'sessions');
const HIDE_SUFFIX = '.hidden-generation';

// ── catalogs, one per encodable target version ────────────────────────────────
const catalogs = new Map();
catalogs.set(3, shipped);
try {
  catalogs.set(
    2,
    fmtMod.createSessionFormatCatalog({
      currentVersion: 2,
      codecs: [e01.releasedV0SessionFormatCodec, e12.releasedV1SessionFormatCodec, e12.releasedV2SessionFormatCodec],
      currentEncoder: e12.releasedV2SessionFormatCodec,
      migrations: [e01.sessionFormatV0ToV1, e12.sessionFormatV1ToV2],
      // Without this the catalog has no transformed-target restorer and every migration
      // fails with "this.restoreArtifact is not a function".
      restoreTransformedCurrent: e12.restoreReleasedV2Artifact,
      restoreCurrent: e12.restoreReleasedV2Artifact,
      restoreCurrentHeader: e12.assertReleasedV2Header,
    }),
  );
} catch (e) {
  console.error('warn: could not assemble the v2 catalog: ' + e.message);
}

// ── physical framing ─────────────────────────────────────────────────────────
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function decodeFrames(buf) {
  let offs = [];
  let i = 0;
  while (true) {
    const j = buf.indexOf(MAGIC, i);
    if (j < 0) break;
    offs.push(j);
    i = j + 1;
  }
  if (offs.length === 0 || offs[0] !== 0) offs.unshift(0);
  offs.push(buf.length);
  const parts = [];
  let start = offs[0];
  for (let k = 1; k < offs.length; k++) {
    try {
      parts.push(zlib.zstdDecompressSync(buf.slice(start, offs[k])));
      start = offs[k];
    } catch (e) {
      /* not a real boundary: extend the slice */
    }
  }
  return Buffer.concat(parts).toString('utf8');
}

function countFrames(buf) {
  let n = 0;
  let i = 0;
  while (true) {
    const j = buf.indexOf(MAGIC, i);
    if (j < 0) break;
    n++;
    i = j + 1;
  }
  return n;
}

function humanAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.round(m / 60);
  if (h < 48) return h + 'h';
  return Math.round(h / 24) + 'd';
}

// One checksummed frame for the header, then one frame per batch — the same shape the
// JSONL backend writes (Node's built-in Zstandard at its default level).
function encodeFrames(lines) {
  const frames = [zlib.zstdCompressSync(Buffer.from(lines[0] + '\n', 'utf8'))];
  const BATCH = 200;
  for (let i = 1; i < lines.length; i += BATCH) {
    frames.push(zlib.zstdCompressSync(Buffer.from(lines.slice(i, i + BATCH).join('\n') + '\n', 'utf8')));
  }
  return Buffer.concat(frames);
}

// ── session discovery ────────────────────────────────────────────────────────
function generationFile(dir, version) {
  return path.join(dir, version === 0 ? 'session.jsonl.zstd' : 'session.v' + version + '.jsonl.zstd');
}

function generationsPresent(dir) {
  const found = [];
  for (let v = 0; v <= 8; v++) {
    const f = generationFile(dir, v);
    if (fs.existsSync(f)) found.push({ version: v, file: f, size: fs.statSync(f).size, mtime: fs.statSync(f).mtimeMs });
    const h = f + HIDE_SUFFIX;
    if (fs.existsSync(h)) found.push({ version: v, file: h, size: fs.statSync(h).size, mtime: fs.statSync(h).mtimeMs, hidden: true });
  }
  return found;
}

function sessions() {
  const out = [];
  if (!fs.existsSync(ROOT)) return out;
  for (const project of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const pd = path.join(ROOT, project.name);
    for (const entry of fs.readdirSync(pd, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(pd, entry.name);
      const gens = generationsPresent(dir);
      if (gens.length) out.push({ id: entry.name, project: project.name, dir, generations: gens });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function readLog(file) {
  const rows = decodeFrames(fs.readFileSync(file))
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
  return rows;
}

function headerVersion(rows) {
  return shipped.readHeader(rows[0]).storedVersion;
}

// ── the two alpha-era payload repairs, applied only in memory ────────────────
function tryRestore(rows, catalog) {
  const repairs = [];
  const work = rows.slice(1).map((r) => JSON.parse(JSON.stringify(r)));
  for (let attempt = 0; attempt < 40; attempt++) {
    let restore;
    try {
      restore = catalog.createRestore(rows[0], { recovery: 'recoverable', validation: 'transformed' });
    } catch (e) {
      return { ok: false, error: e.message, repairs };
    }
    try {
      for (const row of work) restore.decodeRow(row);
      return { ok: true, current: restore.finish(), repairs };
    } catch (e) {
      const msg = String(e.message || e);
      const m1 = /(\S+) (\d+) data has unexpected member "([^"]+)"/.exec(msg);
      if (m1) {
        const target = work.find((r) => r.type === m1[1]);
        if (!target || !target.data || !(m1[3] in target.data)) return { ok: false, error: msg + ' (repair target not found)', repairs };
        delete target.data[m1[3]];
        repairs.push(m1[1] + '.data.' + m1[3] + ' removed');
        continue;
      }
      const m2 = /(\S+) (\d+) uses unsupported descriptor version (\d+)/.exec(msg);
      if (m2) {
        const target = work.find((r) => r.type === m2[1]);
        if (!target || !target.data || typeof target.data.version !== 'number') return { ok: false, error: msg + ' (repair target not found)', repairs };
        target.data.version = 3;
        repairs.push(m2[1] + '.data.version ' + m2[2] + '->3');
        continue;
      }
      return { ok: false, error: msg, repairs };
    }
  }
  return { ok: false, error: 'repair limit reached', repairs };
}

function barrier(catalog, rows) {
  const r = catalog.createRestore(rows[0], { recovery: 'strict', validation: 'current' });
  for (let k = 1; k < rows.length; k++) r.decodeRow(rows[k]);
  const cur = r.finish();
  const seqs = cur.events.map((e) => e.seq);
  let gap = 'none';
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] !== seqs[i - 1] + 1) {
      gap = seqs[i - 1] + '->' + seqs[i];
      break;
    }
  }
  return { count: cur.events.length, lo: seqs.length ? seqs[0] : -1, hi: seqs.length ? seqs[seqs.length - 1] : -1, gap };
}

// ── cli ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[key] = true;
      else {
        a[key] = next;
        i++;
      }
    } else a._.push(t);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] || 'list';
const WRITE = Boolean(args.write);
const FORCE = Boolean(args.force);
const LIVE_WINDOW_MS = 120000;

function pickTargets() {
  const all = sessions();
  if (args.all) return all;
  if (typeof args.id === 'string') {
    const hit = all.filter((s) => s.id === args.id || s.id === 'session-' + args.id);
    if (!hit.length) {
      console.error('no session matching ' + args.id);
      process.exit(2);
    }
    return hit;
  }
  console.error('pass --id <sessionId> or --all');
  process.exit(2);
}

if (cmd === 'list') {
  if (args.json) {
    const now = Date.now();
    const payload = sessions().map((s) => {
      const visible = s.generations.filter((g) => !g.hidden).sort((a, b) => b.version - a.version)[0];
      let active = null;
      if (visible) {
        try { active = headerVersion(readLog(visible.file)); } catch (_) { active = null; }
      }
      return {
        id: s.id,
        project: s.project,
        active,
        ageMs: visible ? now - visible.mtime : null,
        recent: s.generations.some((g) => now - g.mtime < LIVE_WINDOW_MS),
        generations: s.generations.map((g) => ({ version: g.version, hidden: Boolean(g.hidden), size: g.size, mtime: g.mtime })),
      };
    });
    console.log(JSON.stringify({ ok: true, sessions: payload }));
    process.exit(0);
  }
  const all = sessions();
  console.log('sessions: ' + all.length + '   (mode: read-only)');
  console.log('');
  for (const s of all) {
    const now = Date.now();
    const parts = s.generations.map((g) => {
      // "recent" is a mtime fact, not a liveness claim: we cannot see the writer's lock.
      const recent = now - g.mtime < LIVE_WINDOW_MS ? ' recent' : '';
      return 'v' + g.version + (g.hidden ? '(hidden)' : '') + recent;
    });
    let ver = '?';
    let age = '';
    const newest = s.generations.filter((g) => !g.hidden).sort((a, b) => b.version - a.version)[0];
    if (newest) {
      age = '  age=' + humanAge(now - newest.mtime);
      try {
        ver = String(headerVersion(readLog(newest.file)));
      } catch (e) {
        ver = 'unreadable';
      }
    }
    console.log('  ' + s.id);
    console.log('     project=' + s.project + '  active=v' + ver + age + '  files=[' + parts.join(', ') + ']');
  }
  process.exit(0);
}

if (cmd === 'probe') {
  const t = pickTargets()[0];
  const gen = args.gen === undefined ? null : Number(String(args.gen).replace(/^v/, ''));
  const pool = gen === null ? t.generations.filter((g) => !g.hidden) : t.generations.filter((g) => g.version === gen);
  if (!pool.length) {
    console.error('no such generation in ' + t.id);
    process.exit(2);
  }
  const g = pool.sort((a, b) => b.version - a.version)[0];
  const buf = fs.readFileSync(g.file);
  const text = decodeFrames(buf);
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  const head = JSON.parse(rows[0]);
  const desc = shipped.readHeader(head);
  console.log('file      : ' + g.file);
  console.log('bytes     : ' + buf.length + '   frames: ' + countFrames(buf));
  console.log('rows      : ' + rows.length + '   (1 header + ' + (rows.length - 1) + ' events)');
  console.log('readHeader: status=' + desc.status + ' storedVersion=' + desc.storedVersion);
  console.log('header    : ' + rows[0]);
  let seqs = null;
  if (rows.length > 1) {
    seqs = rows.slice(1).map((l) => JSON.parse(l).seq);
    const gaps = seqs.filter((v, i) => i > 0 && v !== seqs[i - 1] + 1 && v !== seqs[i - 1]);
    console.log('seq       : ' + seqs[0] + '..' + seqs[seqs.length - 1] + '  gaps=' + (gaps.length ? gaps.join(',') : 'none'));
    console.log('first ev  : ' + rows[1].slice(0, 200));
    console.log('last ev   : ' + rows[rows.length - 1].slice(0, 200));
  } else {
    console.log('events    : none (header only)');
  }
  console.log('headerVer : ' + head.version + (g.hidden ? '   (HIDDEN — the runtime ignores this file)' : ''));
  process.exit(0);
}

if (cmd === 'convert') {
  const to = Number(String(args.to || '').replace(/^v/, ''));
  if (![0, 1, 2, 3].includes(to)) {
    console.error('--to must be 0|1|2|3');
    process.exit(2);
  }
  if (!catalogs.has(to)) {
    console.error(
      'refused: the kernel exposes no ENCODER for v' + to + ' (v0/v1 are decode-only frozen readers).\n' +
        '         Encodable targets: v2, v3.',
    );
    process.exit(3);
  }
  const catalog = catalogs.get(to);
  console.log('convert -> v' + to + '   mode: ' + (WRITE ? 'WRITE' : 'DRY-RUN'));
  let ok = 0;
  let skip = 0;
  let refuse = 0;
  let fail = 0;
  for (const s of pickTargets()) {
    const visible = s.generations.filter((g) => !g.hidden);
    if (!visible.length) {
      console.log('SKIP  ' + s.id + '  (no visible generation)');
      skip++;
      continue;
    }
    let src;
    if (args.from !== undefined) {
      const want = Number(String(args.from).replace(/^v/, ''));
      src = visible.find((g) => g.version === want && !g.hidden);
      if (!src) {
        console.log('SKIP  ' + s.id + '  no source generation v' + want);
        skip++;
        continue;
      }
    } else {
      src = visible.sort((a, b) => b.version - a.version)[0];
    }
    let srcVer;
    try {
      srcVer = headerVersion(readLog(src.file));
    } catch (e) {
      console.log('FAIL  ' + s.id + '  source unreadable: ' + e.message);
      fail++;
      continue;
    }
    if (srcVer > to) {
      console.log('REFUSE ' + s.id + '  v' + srcVer + ' -> v' + to + '  (no reverse migration edge in the kernel; use `hide`)');
      refuse++;
      continue;
    }
    const dest = generationFile(s.dir, to);
    if (fs.existsSync(dest) && !FORCE) {
      console.log('SKIP  ' + s.id + '  v' + to + ' already present (use --force to rebuild)');
      skip++;
      continue;
    }
    if (fs.existsSync(dest) && Date.now() - fs.statSync(dest).mtimeMs < LIVE_WINDOW_MS && !FORCE) {
      console.log('REFUSE ' + s.id + '  target v' + to + ' was written <2m ago — possibly a live session (use --force only if you know it is idle)');
      refuse++;
      continue;
    }
    const res = tryRestore(readLog(src.file), catalog);
    if (!res.ok) {
      console.log('FAIL  ' + s.id + '  v' + srcVer + ' -> v' + to + '  ' + res.error);
      fail++;
      continue;
    }
    const lines = [
      JSON.stringify(catalog.encodeCurrentHeader(res.current.header, res.current.inheritedEventCount)),
      ...res.current.events.map((ev) => JSON.stringify(catalog.encodeCurrentEvent(ev))),
    ];
    let note = '';
    if (WRITE) {
      fs.writeFileSync(dest, encodeFrames(lines));
      try {
        const b = barrier(catalog, readLog(dest));
        note = '  verified events=' + b.count + ' seq=' + b.lo + '..' + b.hi + ' gap=' + b.gap;
      } catch (e) {
        note = '  WRITTEN BUT VERIFY FAILED: ' + e.message;
        fail++;
      }
    } else {
      note = '  would write ' + path.basename(dest) + ' events=' + res.current.events.length;
    }
    console.log(
      'OK    ' + s.id + '  v' + srcVer + ' -> v' + to + '  events=' + res.current.events.length +
        (res.repairs.length ? '  repaired=[' + res.repairs.join(', ') + ']' : '') + note,
    );
    ok++;
  }
  console.log('');
  console.log('converted=' + ok + '  skipped=' + skip + '  refused=' + refuse + '  failed=' + fail);
  process.exit(0);
}

if (cmd === 'hide' || cmd === 'show') {
  const gen = Number(String(args.gen || args.generation || '').replace(/^v/, ''));
  if (!Number.isInteger(gen) || gen < 0) {
    console.error('--gen must be a generation number (0..N)');
    process.exit(2);
  }
  console.log(cmd + ' generation v' + gen + '   mode: ' + (WRITE ? 'WRITE' : 'DRY-RUN'));
  let ok = 0;
  let miss = 0;
  for (const s of pickTargets()) {
    const plain = generationFile(s.dir, gen);
    const hidden = plain + HIDE_SUFFIX;
    const from = cmd === 'hide' ? plain : hidden;
    const to = cmd === 'hide' ? hidden : plain;
    if (!fs.existsSync(from)) {
      console.log('SKIP  ' + s.id + '  no ' + path.basename(from));
      miss++;
      continue;
    }
    if (fs.existsSync(to)) {
      console.log('SKIP  ' + s.id + '  ' + path.basename(to) + ' already exists');
      miss++;
      continue;
    }
    const mtime = fs.statSync(from).mtimeMs;
    if (Date.now() - mtime < LIVE_WINDOW_MS && !FORCE) {
      console.log('REFUSE ' + s.id + '  v' + gen + ' is being written by a LIVE session');
      miss++;
      continue;
    }
    if (WRITE) fs.renameSync(from, to);
    console.log((WRITE ? 'OK    ' : 'WOULD ') + s.id + '  ' + path.basename(from) + ' -> ' + path.basename(to));
    ok++;
  }
  console.log('');
  console.log((WRITE ? 'done=' : 'would=') + ok + '  skipped=' + miss);
  process.exit(0);
}

console.error('unknown command: ' + cmd);
console.error('usage: list | probe --id ID [--gen N] | convert --to <N> [--id ID|--all] [--write] | hide --gen <N> ... | show --gen <N> ...');
process.exit(2);
