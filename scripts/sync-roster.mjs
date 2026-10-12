#!/usr/bin/env node
/**
 * Syncs src/data/resonators.txt with the encore.moe API.
 *
 *   npm run roster          update the file (keeps your manual edits)
 *   npm run roster -- --check   only report, don't write
 *
 * What it does:
 * - Lists every playable resonator, newest first (encore's `Priority` field
 *   is the in-game release order).
 * - Detects dual-mode resonators by looking for "Resonance Mode - X" in
 *   their skill text.
 * - Collapses the per-element Rover entries into "Rover (Male)" and
 *   "Rover (Female)", with every known element listed.
 *
 * Lines already in the file win: if you changed a mode by hand, the script
 * keeps your line and only reports the difference. Lines for characters the
 * API doesn't have yet (leaks, upcoming banners) stay at the top.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://api-v2.encore.moe/api/en/character';
const FILE = fileURLToPath(new URL('../src/data/resonators.txt', import.meta.url));
const CHECK_ONLY = process.argv.includes('--check');

const HEADER = `# Resonator roster: the single source for names, modes, order, element and weapon.
#
# One resonator per line, NEWEST FIRST (the picker shows them in this order):
#
#   Name ; Mode ; Element ; Weapon
#
# Mode    single                      one playstyle
#         Mode A / Mode B             dual mode, first one is the default
#         element                     switches element (Rover); list them in Element
# Element Glacio, Fusion, Electro, Aero, Spectro, Havoc  (several: "Havoc / Spectro")
# Weapon  Broadblade, Sword, Pistols, Gauntlets, Rectifier
#
# Names must match the game's English name so pictures can be found.
# A character the image API doesn't have yet still shows up, without art.
# Run \`npm run roster\` to pull new characters and check modes against the API.
`;

async function getJSON(url, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i + 1 >= tries) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const key = (name) => name.trim().toLowerCase();

function parseFile(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const name = line.split(';')[0].trim();
    if (name) lines.push({ name, line: raw.trimEnd() });
  }
  return lines;
}

const fmt = (name, mode, element, weapon) => `${name} ; ${mode} ; ${element} ; ${weapon}`;

async function main() {
  const { roleList } = await getJSON(API);
  process.stdout.write(`Fetching ${roleList.length} resonators`);
  const details = await mapLimit(roleList, 8, async (r) => {
    const d = await getJSON(`${API}/${r.Id}`);
    process.stdout.write('.');
    const text = JSON.stringify(d);
    const modes = [];
    for (const m of text.matchAll(/Resonance Mode - ([^<"\\]+?)</g)) {
      const name = m[1].trim();
      if (!modes.includes(name)) modes.push(name);
    }
    return {
      id: r.Id,
      name: r.Name,
      priority: d.Priority ?? 0,
      element: d.ElementName ?? r.Element?.Name,
      weapon: d.WeaponTypeName ?? r.WeaponType?.Name,
      male: /^Male/i.test(d.RoleBody ?? ''),
      modes,
      playable: d.RoleType === 1 && !d.IsTrial,
    };
  });
  process.stdout.write('\n');

  // Build API lines, newest first.
  const api = [];
  const rovers = { Male: null, Female: null };
  for (const c of details.filter((d) => d.playable)) {
    if (/^Rover\b/.test(c.name)) {
      const g = c.male ? 'Male' : 'Female';
      const el = c.name.split(':')[1]?.trim() ?? c.element;
      const r = (rovers[g] ??= { name: `Rover (${g})`, priority: c.priority, elements: [], weapon: c.weapon });
      if (!r.elements.includes(el)) r.elements.push(el);
      r.priority = Math.min(r.priority, c.priority);
      continue;
    }
    const mode = c.modes.length >= 2 ? c.modes.join(' / ') : 'single';
    api.push({ name: c.name, priority: c.priority, line: fmt(c.name, mode, c.element, c.weapon), mode });
  }
  for (const r of Object.values(rovers)) {
    if (!r) continue;
    api.push({ name: r.name, priority: r.priority, line: fmt(r.name, 'element', r.elements.join(' / '), r.weapon), mode: 'element' });
  }
  api.sort((a, b) => b.priority - a.priority);

  let existing = [];
  try {
    existing = parseFile(await readFile(FILE, 'utf8'));
  } catch {
    /* first run */
  }
  const byName = new Map(existing.map((l) => [key(l.name), l]));
  const apiNames = new Set(api.map((a) => key(a.name)));

  const added = [];
  const differs = [];
  const body = [];
  // Manual entries the API doesn't know yet stay on top.
  const manual = existing.filter((l) => !apiNames.has(key(l.name)));
  for (const l of manual) body.push(l.line);

  for (const a of api) {
    const mine = byName.get(key(a.name));
    if (!mine) {
      added.push(a.line);
      body.push(a.line);
      continue;
    }
    const myMode = (mine.line.split(';')[1] ?? '').trim();
    if (key(myMode) !== key(a.mode)) differs.push(`${a.name}: file says "${myMode}", API suggests "${a.mode}"`);
    if (a.name.startsWith('Rover')) {
      const myEls = (mine.line.split(';')[2] ?? '').split('/').map(key);
      const apiEls = (a.line.split(';')[2] ?? '').split('/').map((s) => s.trim());
      const missing = apiEls.filter((e) => !myEls.includes(key(e)));
      if (missing.length) differs.push(`${a.name}: API has element(s) not in file: ${missing.join(', ')}`);
    }
    body.push(mine.line);
  }

  console.log(`\n${api.length} resonators from the API, ${manual.length} manual-only line(s) kept.`);
  if (added.length) console.log(`\nNew lines:\n  ${added.join('\n  ')}`);
  if (manual.length) console.log(`\nNot in the API (kept as written):\n  ${manual.map((m) => m.name).join(', ')}`);
  if (differs.length) console.log(`\nCheck these (your line was kept):\n  ${differs.join('\n  ')}`);
  if (!added.length && !differs.length) console.log('File already matches the API.');

  if (CHECK_ONLY) return;
  await writeFile(FILE, `${HEADER}\n${body.join('\n')}\n`, 'utf8');
  console.log(`\nWrote ${FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
