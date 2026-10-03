// ─────────────────────────────────────────────────────────────────────────────
//  tagmeta.js — t114: INSTANT song info from the file's own tags
// ─────────────────────────────────────────────────────────────────────────────
//  The owner makes music: DAWs and DJ tools already write BPM (and often the
//  initial key) INTO the file. Reading those tags is instant — no analysis
//  pass, no waiting — so the booth knows a track's tempo the moment the
//  library loads. Zero dependencies, bounded reads (never the whole file).
//
//  Formats covered:
//    MP3  → ID3v2.2 (TBP/TKE) · ID3v2.3/2.4 (TBPM/TKEY), tag at the file head
//    FLAC → Vorbis comments (BPM / INITIALKEY), near the head
//    OGG  → Vorbis comments, text-scanned in the first 256 KB
//    M4A  → MP4 atoms: ©tmpo (BPM) + the iTunes freeform initialkey,
//           moov at head OR tail (both handled)
//    WAV  → no dependable standard → the client analyzer covers it
//  Output: { bpm: number|null, keyTag: string|null } — the key stays a raw
//  string ("8B", "F#m", "F# minor"); the client maps it to Camelot.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';

const MAX_HEAD = 512 * 1024;          // tags live at the head for mp3/flac/ogg
const MAX_TAIL = 8 * 1024 * 1024;     // MP4 moov can sit at the very end

function readChunk(fd, start, len, fileSize) {
  const l = Math.max(0, Math.min(len, fileSize - start));
  if (l <= 0) return null;
  const b = Buffer.alloc(l);
  const got = fs.readSync(fd, b, 0, l, start);
  return got === l ? b : (got > 0 ? b.subarray(0, got) : null);
}

function decodeText(bytes) {          // ID3 text frame body: [encoding][text]
  if (!bytes || !bytes.length) return null;
  const enc = bytes[0], body = bytes.subarray(1);
  let s = null;
  if (enc === 0) s = body.toString('latin1');
  else if (enc === 3) s = body.toString('utf8');
  else if (enc === 1) s = body.toString('utf16le');           // BOM'd UTF-16 (close enough for tag text)
  else if (enc === 2) s = body.toString('utf16le');
  if (!s) return null;
  s = s.replace(/\0+$/g, '').replace(/^ÿþ|^\uFEFF/, '').trim();
  return s || null;
}

function parseId3(buf) {
  if (!buf || buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null;
  const ver = buf[3];                                       // 2 / 3 / 4
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const end = Math.min(buf.length, 10 + size);
  const out = {};
  let p = 10;
  while (p < end - 6) {
    let id, flen, hlen;
    if (ver === 2) { id = buf.toString('latin1', p, p + 3); flen = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5]; hlen = 6; if (!/^[A-Z0-9]{3}$/.test(id)) break; }
    else { id = buf.toString('latin1', p, p + 4); flen = ver === 4 ? (((buf[p + 4] & 0x7f) << 21) | ((buf[p + 5] & 0x7f) << 14) | ((buf[p + 6] & 0x7f) << 7) | (buf[p + 7] & 0x7f)) : buf.readUInt32BE(p + 4); hlen = 10; if (!/^[A-Z0-9]{4}$/.test(id)) break; }
    if (flen <= 0 || p + hlen + flen > buf.length) break;
    const body = buf.subarray(p + hlen, p + hlen + flen);
    if (id === 'TBPM' || id === 'TBP' || id === 'TPB') { const v = parseFloat(decodeText(body) || ''); if (v > 0 && v < 400) out.bpm = v; }
    if (id === 'TKEY' || id === 'TKE') { const v = decodeText(body); if (v) out.keyTag = v; }
    p += hlen + flen;
  }
  return out;
}

function scanVorbisText(buf) {        // comments are plain "KEY=value" UTF-8 runs
  if (!buf) return null;
  const s = buf.toString('latin1');
  const out = {};
  const mb = s.match(/\bBPM=([0-9]+(?:\.[0-9]+)?)/i);
  if (mb) { const v = parseFloat(mb[1]); if (v > 0 && v < 400) out.bpm = v; }
  const mk = s.match(/\bINITIALKEY=([^\r\n\x00]+)/i) || s.match(/\bKEY=([A-G][#b]?[^\r\n\x00]{0,10})/i);
  if (mk) { const v = mk[1].trim(); if (v && v.length <= 12) out.keyTag = v; }
  return Object.keys(out).length ? out : null;
}

function mp4Walk(buf, out) {          // find moov → udta → meta → ilst
  if (!buf) return;
  // moov may start anywhere in the tail chunk — scan for the atom header
  let moovOff = -1;
  for (let i = 4; i < buf.length - 7; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x6f && buf[i + 2] === 0x6f && buf[i + 3] === 0x76) {   // 'moov'
      const sz = buf.readUInt32BE(i - 4);
      if (sz >= 8 && i - 4 + sz <= buf.length + 4096) { moovOff = i - 4; break; }                  // sane size
    }
  }
  if (moovOff < 0) return;
  const findAtom = (start, end, type, depth) => {
    const hits = [];
    let p = start;
    while (p < end - 7 && depth >= 0) {
      let sz = buf.readUInt32BE(p);
      const ty = buf.toString('latin1', p + 4, p + 8);
      if (sz === 1) { const hi = buf.readUInt32BE(p + 8), lo = buf.readUInt32BE(p + 12); if (hi !== 0) break; sz = lo; }
      if (sz < 8 || p + sz > end) { if (ty === type) hits.push([p + 8, Math.min(end, p + sz)]); break; }
      if (ty === type) hits.push([p + 8, p + sz]);
      p += sz;
    }
    return hits;
  };
  const moovEnd = moovOff + Math.min(buf.length - moovOff, buf.readUInt32BE(moovOff));
  const udtas = findAtom(moovOff + 8, moovEnd, 'udta', 1);
  for (const [us, ue] of udtas) {
    const metas = findAtom(us, ue, 'meta', 2);
    for (const [ms, me] of metas) {
      const ilsts = findAtom(ms + 4, me, 'ilst', 3);        // meta carries 4 version/flags bytes first
      for (const [is2, ie] of ilsts) {
        // walk the ilst children: ©tmpo and ---- freeform
        let p = is2;
        while (p < ie - 7) {
          let sz = buf.readUInt32BE(p);
          const ty = buf.toString('latin1', p + 4, p + 8);
          if (sz === 1) { sz = buf.readUInt32BE(p + 12); }
          if (sz < 8 || p + sz > ie + 8) break;
          if (ty === 'tmpo') {                            // Apple's BPM atom: 'tmpo' (no ©-prefix)
            // child 'data' atom: [size]['data'][ver/flags 4][locale 4][2-byte BE int]
            const ds = p + 8;
            if (ds + 18 <= buf.length && buf.toString('latin1', ds + 4, ds + 8) === 'data') {
              const v = buf.readUInt16BE(ds + 16);
              if (v > 0 && v < 400) out.bpm = v;
            }
          } else if (ty === '----') {
            // freeform: mean / name / data children
            const seg = buf.toString('latin1', p + 8, Math.min(p + sz, ie));
            if (/initialkey/i.test(seg)) {
              const dAt = buf.indexOf('data', p + 8);
              if (dAt > 0 && dAt + 12 < buf.length) {
                const dl = buf.readUInt32BE(dAt - 4);
                const v = buf.toString('utf8', dAt + 12, Math.min(dAt - 4 + dl, dAt + 12 + 60)).replace(/\0+$/g, '').trim();
                if (v) out.keyTag = v;
              }
            }
          }
          p += sz;
        }
      }
    }
  }
}

export function readAudioTags(absPath) {
  let fd;
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size < 16) return null;
    fd = fs.openSync(absPath, 'r');
    const head = readChunk(fd, 0, MAX_HEAD, st.size);
    const out = {};
    const ext = absPath.toLowerCase().split('.').pop();
    if (head && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {         // ID3 (mp3)
      Object.assign(out, parseId3(head) || {});
    } else if (head && head.toString('latin1', 0, 4) === 'fLaC') {                   // FLAC
      Object.assign(out, scanVorbisText(head) || {});
    } else if (ext === 'ogg') {                                                      // OGG (comments mid-stream)
      Object.assign(out, scanVorbisText(head) || {});
    } else if (ext === 'm4a' || ext === 'mp4' || (head && head.toString('latin1', 4, 8) === 'ftyp')) {
      mp4Walk(head, out);                                                            // moov at the head…
      if (!out.bpm && !out.keyTag) {                                                 // …or at the tail
        const tail = readChunk(fd, Math.max(0, st.size - MAX_TAIL), MAX_TAIL, st.size);
        if (tail) {
          // a tail chunk starts mid-atom; find 'moov' with its header and parse
          mp4Walk(tail, out);
        }
      }
    }
    return (out.bpm || out.keyTag) ? out : null;
  } catch { return null; }
  finally { try { if (fd !== undefined) fs.closeSync(fd); } catch {} }
}

// ── t151: embedded cover art — the picture IN the file ──────────────────────
// Returns a JPEG/PNG Buffer or null. Bounded reads, same doctrine as the tags.
const IMG_OK = (b) => !!b && b.length > 64 && b.length < 4 * 1024 * 1024
  && ((b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50));

function id3Picture(buf) {            // APIC (v2.3/2.4) · PIC (v2.2)
  if (!buf || buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null;
  const ver = buf[3];
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  const end = Math.min(buf.length, 10 + size);
  let p = 10;
  while (p < end - 6) {
    let id, flen, hlen, off;
    if (ver === 2) { id = buf.toString('latin1', p, p + 3); flen = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5]; hlen = 6; off = p + 6; }
    else { id = buf.toString('latin1', p, p + 4); flen = ver === 4 ? (((buf[p + 4] & 0x7f) << 21) | ((buf[p + 5] & 0x7f) << 14) | ((buf[p + 6] & 0x7f) << 7) | (buf[p + 7] & 0x7f)) : buf.readUInt32BE(p + 4); hlen = 10; off = p + 10; }
    if (flen <= 0 || off + flen > buf.length) break;
    if (id === 'APIC' || id === 'PIC') {
      const body = buf.subarray(off, off + flen);
      let q = 1;                                                    // [encoding]
      if (id === 'PIC') q += 3;                                     // 3-char format
      else { while (q < body.length && body[q] !== 0) q++; q++; }   // mime  
      q++;                                                          // picture type
      const enc = body[0];
      if (enc === 1 || enc === 2) { while (q + 1 < body.length && !(body[q] === 0 && body[q + 1] === 0)) q += 2; q += 2; }
      else { while (q < body.length && body[q] !== 0) q++; q++; }   // description  
      const img = body.subarray(q);
      return IMG_OK(img) ? Buffer.from(img) : null;
    }
    p += hlen + flen;
  }
  return null;
}

function flacPicture(buf) {           // metadata block type 6
  if (!buf || buf.toString('latin1', 0, 4) !== 'fLaC') return null;
  let p = 4;
  while (p + 4 <= buf.length) {
    const head = buf[p];
    const last = head & 0x80, type = head & 0x7f;
    const len = (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
    const off = p + 4;
    if (type === 6 && off + 8 <= buf.length) {
      let q = off + 4;                                             // picture type
      const mimeLen = buf.readUInt32BE(q); q += 4;
      q += mimeLen;                                                // mime string
      const descLen = buf.readUInt32BE(q); q += 4 + descLen;
      q += 16;                                                     // w · h · depth · colors
      if (q + 4 > buf.length) return null;
      const dataLen = buf.readUInt32BE(q); q += 4;
      const img = buf.subarray(q, Math.min(buf.length, q + dataLen));
      return IMG_OK(img) ? Buffer.from(img) : null;
    }
    if (last || len <= 0) break;
    p = off + len;
  }
  return null;
}

function mp4Cover(buf) {              // moov → udta → meta → ilst → covr → data
  const out = {};
  const save = { push: (i) => {} };
  // reuse the existing atom walker shape, but return the covr payload
  let moovOff = -1;
  for (let i = 4; i < buf.length - 7; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x6f && buf[i + 2] === 0x6f && buf[i + 3] === 0x76) {
      const sz = buf.readUInt32BE(i - 4);
      if (sz >= 8 && i - 4 + sz <= buf.length + 4096) { moovOff = i - 4; break; }
    }
  }
  if (moovOff < 0) return null;
  const findAtom = (start, end, type) => {
    const hits = []; let p = start;
    while (p < end - 7) {
      let sz = buf.readUInt32BE(p);
      const ty = buf.toString('latin1', p + 4, p + 8);
      if (sz === 1) { const hi = buf.readUInt32BE(p + 8), lo = buf.readUInt32BE(p + 12); if (hi !== 0) break; sz = lo; }
      if (sz < 8 || p + sz > end) { if (ty === type) hits.push([p + 8, Math.min(end, p + sz)]); break; }
      if (ty === type) hits.push([p + 8, p + sz]);
      p += sz;
    }
    return hits;
  };
  const moovEnd = moovOff + Math.min(buf.length - moovOff, buf.readUInt32BE(moovOff));
  for (const [us, ue] of findAtom(moovOff + 8, moovEnd, 'udta'))
    for (const [ms, me] of findAtom(us, ue, 'meta'))
      for (const [is2, ie] of findAtom(ms + 4, me, 'ilst')) {
        let p = is2;
        while (p < ie - 7) {
          let sz = buf.readUInt32BE(p);
          const ty = buf.toString('latin1', p + 4, p + 8);
          if (sz === 1) sz = buf.readUInt32BE(p + 12);
          if (sz < 8 || p + sz > ie + 8) break;
          if (ty === 'covr') {
            const ds = p + 8;
            if (buf.toString('latin1', ds + 4, ds + 8) === 'data') {
              const dl = buf.readUInt32BE(ds);
              const img = buf.subarray(ds + 16, Math.min(buf.length, ds + dl));
              if (IMG_OK(img)) return Buffer.from(img);
            }
          }
          p += sz;
        }
      }
  return null;
}

export function readCoverArt(absPath) {
  let fd;
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size < 16) return null;
    fd = fs.openSync(absPath, 'r');
    const head = readChunk(fd, 0, MAX_HEAD, st.size);
    if (!head) return null;
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return id3Picture(head);          // mp3
    if (head.toString('latin1', 0, 4) === 'fLaC') return flacPicture(head);                          // flac
    const ext = absPath.toLowerCase().split('.').pop();
    if (ext === 'm4a' || ext === 'mp4' || head.toString('latin1', 4, 8) === 'ftyp') {                // mp4
      return mp4Cover(head) || (() => { const tail = readChunk(fd, Math.max(0, st.size - MAX_TAIL), MAX_TAIL, st.size); return tail ? mp4Cover(tail) : null; })();
    }
    return null;
  } catch { return null; }
  finally { try { if (fd !== undefined) fs.closeSync(fd); } catch {} }
}
