/**
 * Save / load formats.
 *
 * - .json: plain team data.
 * - .png / .jpg: the exported showcase image carries the same team data
 *   inside the file (a PNG tEXt chunk or JPEG comment segments), so an
 *   exported image can be imported back. Sites that re-compress images
 *   (most social media) strip this data; the original file keeps it.
 */
import { sanitizeTeams, type Team } from './store';

const APP = 'wuwa-team-builder';
const PNG_KEYWORD = 'wuwa-teams';
const JPG_PREFIX = 'WTB:';

interface Payload {
  app: string;
  v: number;
  teams: Array<Omit<Team, 'id'>>;
}

export function buildPayload(teams: Team[]): Payload {
  return { app: APP, v: 1, teams: teams.map(({ id: _id, ...rest }) => rest) };
}

const utf8ToB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const b64ToUtf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/* ---------------- PNG ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bytesToStr(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export function embedInPng(png: Uint8Array, text: string): Uint8Array {
  const data = latin1(`${PNG_KEYWORD}\0${utf8ToB64(text)}`);
  const type = latin1('tEXt');
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcInput));
  // Insert right after IHDR (8-byte signature + 25-byte IHDR chunk).
  const at = 33;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

function readFromPng(buf: Uint8Array): string | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(...buf.subarray(p + 4, p + 8));
    if (type === 'tEXt') {
      const body = bytesToStr(buf.subarray(p + 8, p + 8 + len));
      const sep = body.indexOf('\0');
      if (body.slice(0, sep) === PNG_KEYWORD) return b64ToUtf8(body.slice(sep + 1));
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

/* ---------------- JPEG ---------------- */

export function embedInJpg(jpg: Uint8Array, text: string): Uint8Array {
  const b64 = utf8ToB64(text);
  const max = 60000;
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += max) parts.push(b64.slice(i, i + max));
  const segments = parts.map((part, i) => {
    const body = latin1(`${JPG_PREFIX}${i + 1}/${parts.length}:${part}`);
    const seg = new Uint8Array(4 + body.length);
    seg[0] = 0xff;
    seg[1] = 0xfe; // COM
    new DataView(seg.buffer).setUint16(2, body.length + 2);
    seg.set(body, 4);
    return seg;
  });
  const total = segments.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(jpg.length + total);
  out.set(jpg.subarray(0, 2), 0); // SOI
  let o = 2;
  for (const s of segments) {
    out.set(s, o);
    o += s.length;
  }
  out.set(jpg.subarray(2), o);
  return out;
}

function readFromJpg(buf: Uint8Array): string | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const parts: string[] = [];
  let p = 2;
  while (p + 4 <= buf.length && buf[p] === 0xff) {
    const marker = buf[p + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const len = dv.getUint16(p + 2);
    if (marker === 0xfe) {
      const body = bytesToStr(buf.subarray(p + 4, p + 2 + len));
      const m = body.match(/^WTB:(\d+)\/(\d+):/);
      if (m) parts[Number(m[1]) - 1] = body.slice(m[0].length);
    }
    p += 2 + len;
  }
  return parts.length ? b64ToUtf8(parts.join('')) : null;
}

/* ---------------- Import ---------------- */

export async function parseImportFile(file: File): Promise<Team[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let text: string | null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (isPng) text = readFromPng(buf);
  else if (isJpg) text = readFromJpg(buf);
  else text = new TextDecoder().decode(buf);

  if (!text) {
    throw new Error(
      'This image has no team data. Only images exported from this site (and not re-uploaded through social media) can be imported.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid team data.');
  }
  const payload = parsed as Partial<Payload> | unknown[];
  const teams = Array.isArray(payload) ? payload : (payload as Partial<Payload>).teams;
  return sanitizeTeams(teams);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
