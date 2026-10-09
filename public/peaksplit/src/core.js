// ================= Peaksplit core =================
const BASES = ['A', 'C', 'G', 'T'];
const BI = { A: 0, C: 1, G: 2, T: 3 };
const IUPAC = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D' };
const UNIFORM = [0.25, 0.25, 0.25, 0.25];

function revcomp(s) { let o = ''; for (let i = s.length - 1; i >= 0; i--) o += COMP[s[i]] || 'N'; return o; }
function cleanSeq(s) { return (s || '').replace(/^>.*$/gm, '').toUpperCase().replace(/U/g, 'T').replace(/[^ACGTRYSWKMBDHVN]/g, ''); }
function oneHot(b) {
  const set = IUPAC[b] || 'ACGT'; const v = [0, 0, 0, 0];
  for (const c of set) v[BI[c]] = 1 / set.length; return v;
}

// ---------- ABIF (.ab1) parser ----------
function parseAB1(buf, name = 'file') {
  const dv = new DataView(buf);
  if (dv.byteLength < 128) throw new Error(`${name} is too small to be an .ab1 file`);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s; };
  if (str(0, 4) !== 'ABIF') throw new Error(`${name} is not an .ab1 (ABIF) file`);
  const nEnt = dv.getInt32(18), dirOff = dv.getInt32(26);
  const tags = {};
  for (let i = 0; i < nEnt; i++) {
    const o = dirOff + i * 28;
    if (o + 28 > dv.byteLength) break;
    const dsize = dv.getInt32(o + 16);
    tags[str(o, 4) + dv.getInt32(o + 4)] = { etype: dv.getInt16(o + 8), esize: dv.getInt16(o + 10), nel: dv.getInt32(o + 12), dsize, doff: dsize <= 4 ? o + 20 : dv.getInt32(o + 20) };
  }
  const shorts = t => { const a = new Int16Array(t.nel); for (let i = 0; i < t.nel; i++) a[i] = dv.getInt16(t.doff + 2 * i); return a; };
  const ushorts = t => { const a = new Array(t.nel); for (let i = 0; i < t.nel; i++) a[i] = dv.getUint16(t.doff + 2 * i); return a; };
  const bytes = t => { const a = new Array(t.nel); for (let i = 0; i < t.nel; i++) a[i] = dv.getUint8(t.doff + i); return a; };
  const order = tags.FWO_1 ? str(tags.FWO_1.doff, 4).toUpperCase() : 'GATC';
  const traces = {};
  for (let k = 0; k < 4; k++) {
    const t = tags['DATA' + (9 + k)];
    if (!t) throw new Error(`${name}: missing analyzed trace channel DATA${9 + k}`);
    traces[order[k]] = shorts(t);
  }
  const pb = tags.PBAS2 || tags.PBAS1, pl = tags.PLOC2 || tags.PLOC1, pc = tags.PCON2 || tags.PCON1;
  if (!pb || !pl) throw new Error(`${name}: no base calls (PBAS/PLOC) found`);
  let seq = str(pb.doff, pb.nel).toUpperCase(), ploc = ushorts(pl);
  const n = Math.min(seq.length, ploc.length);
  seq = seq.slice(0, n); ploc = ploc.slice(0, n);
  const qual = pc ? bytes(pc).slice(0, n) : null;
  return { name, seq, ploc, qual, traces };
}

function reverseTrace(tr) {
  const L = tr.traces.A.length;
  const rev = a => Float32Array.from(a).reverse();
  return {
    ...tr, seq: revcomp(tr.seq), ploc: tr.ploc.map(p => L - 1 - p).reverse(),
    qual: tr.qual ? tr.qual.slice().reverse() : null,
    traces: { A: rev(tr.traces.T), C: rev(tr.traces.G), G: rev(tr.traces.C), T: rev(tr.traces.A) },
    reversed: !tr.reversed,
  };
}

function peakFractions(tr) {
  const T = BASES.map(b => tr.traces[b]); const L = T[0].length;
  return tr.ploc.map(p => {
    const v = T.map(a => { let m = 0; for (let d = -1; d <= 1; d++) { const q = p + d; if (q >= 0 && q < L && a[q] > m) m = a[q]; } return m; });
    const s = v[0] + v[1] + v[2] + v[3];
    return s > 0 ? v.map(x => x / s) : UNIFORM.slice();
  });
}

function usableEnd(tr, minQ = 20, win = 20) {
  if (!tr.qual || tr.qual.length < win) return tr.seq.length;
  let s = 0; for (let i = tr.qual.length - win; i < tr.qual.length; i++) s += tr.qual[i];
  for (let i = tr.qual.length; i >= win; i--) {
    if (s / win >= minQ) return i;
    s += tr.qual[i - win - 1] || 0; s -= tr.qual[i - 1];
  }
  return tr.seq.length;
}

// ---------- Nucleases & guide ----------
const NUCLEASES = {
  SpCas9: { label: 'SpCas9 (NGG)', pam: 'NGG', side: 3, cut: len => len - 3 },
  SpCas9NG: { label: 'SpCas9-NG / SpG (NG)', pam: 'NG', side: 3, cut: len => len - 3 },
  SaCas9: { label: 'SaCas9 (NNGRRT)', pam: 'NNGRRT', side: 3, cut: len => len - 3 },
  Cas12a: { label: 'Cas12a (TTTV)', pam: 'TTTV', side: 5, cut: len => Math.min(18, len) },
};

function findGuide(ref, guide, nucKey) {
  const g = cleanSeq(guide);
  if (g.length < 15) throw new Error('Enter a guide sequence of at least 15 nt (5′→3′, without the PAM).');
  const nuc = NUCLEASES[nucKey] || NUCLEASES.SpCas9; const len = g.length;
  let best = null;
  for (const [strand, q] of [['+', g], ['-', revcomp(g)]]) {
    for (let p = 0; p + len <= ref.length; p++) {
      let mm = 0;
      for (let i = 0; i < len && mm <= 3; i++) if (ref[p + i] !== q[i] && ref[p + i] !== 'N') mm++;
      if (mm <= 3 && (!best || mm < best.mm)) best = { p, strand, mm };
    }
  }
  if (!best) throw new Error('Guide not found in the control read or reference (searched both strands, up to 3 mismatches).');
  const c = nuc.cut(len), pl = nuc.pam.length, p = best.p;
  let cut, pamStart;
  if (best.strand === '+') { cut = p + c; pamStart = nuc.side === 3 ? p + len : p - pl; }
  else { cut = p + len - c; pamStart = nuc.side === 3 ? p - pl : p + len; }
  let pamSeq = pamStart >= 0 && pamStart + pl <= ref.length ? ref.substr(pamStart, pl) : '';
  if (best.strand === '-') pamSeq = revcomp(pamSeq);
  const pamOk = pamSeq.length === pl && [...pamSeq].every((b, i) => (IUPAC[nuc.pam[i]] || '').includes(b));
  return { start: p, end: p + len, len, strand: best.strand, mismatches: best.mm, cut, pamStart, pamEnd: pamStart + pl, pamSeq, pamOk, pam: nuc.pam, side: nuc.side };
}

// ---------- Local alignment (Smith–Waterman, linear gaps) ----------
function localAlign(q, t, match = 2, mismatch = -3, gap = -5) {
  const n = q.length, m = t.length, W = m + 1;
  const H = new Float32Array((n + 1) * W), D = new Uint8Array((n + 1) * W);
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= n; i++) {
    const a = q[i - 1];
    for (let j = 1; j <= m; j++) {
      const b = t[j - 1];
      const s = (a === 'N' || b === 'N') ? 0 : (a === b ? match : mismatch);
      const d = H[(i - 1) * W + j - 1] + s, u = H[(i - 1) * W + j] + gap, l = H[i * W + j - 1] + gap;
      let v = 0, dir = 0;
      if (d > v) { v = d; dir = 1; } if (u > v) { v = u; dir = 2; } if (l > v) { v = l; dir = 3; }
      H[i * W + j] = v; D[i * W + j] = dir;
      if (v > best) { best = v; bi = i; bj = j; }
    }
  }
  const pairs = []; let i = bi, j = bj;
  while (i > 0 && j > 0) {
    const dir = D[i * W + j]; if (!dir) break;
    if (dir === 1) { pairs.push([i - 1, j - 1]); i--; j--; }
    else if (dir === 2) { pairs.push([i - 1, -1]); i--; }
    else { pairs.push([-1, j - 1]); j--; }
  }
  pairs.reverse();
  return { score: best, pairs };
}

function anchorOffset(ref, aStart, aEnd, edSeq) {
  const q = ref.slice(aStart, aEnd);
  const al = localAlign(q, edSeq);
  let matches = 0, last = null;
  for (const [qi, ti] of al.pairs) if (qi >= 0 && ti >= 0 && q[qi] === edSeq[ti]) { matches++; last = [qi, ti]; }
  if (!last || matches < Math.min(12, q.length * 0.6)) return null;
  return { offset: last[1] - (aStart + last[0]), identity: matches / q.length, tailGap: q.length - 1 - last[0] };
}

// ---------- Donor / HDR ----------
function buildHDR(ref, donorRaw, warnings) {
  const donor = cleanSeq(donorRaw);
  if (donor.length < 20) throw new Error('Donor sequence is too short (need ≥ 20 nt).');
  const f = localAlign(donor, ref, 2, -3, -6), r = localAlign(revcomp(donor), ref, 2, -3, -6);
  const useRev = r.score > f.score; const al = useRev ? r : f; const d = useRev ? revcomp(donor) : donor;
  let matches = 0; for (const [qi, ti] of al.pairs) if (qi >= 0 && ti >= 0 && d[qi] === ref[ti]) matches++;
  if (matches < 25) throw new Error('Donor template does not align to the control read. Check it covers the amplified region.');
  const I = [], changes = [], subs = []; let a = null, b = null, lastT = -1, first = Infinity, lastC = -1;
  for (const [qi, ti] of al.pairs) {
    if (qi >= 0 && ti >= 0) {
      if (a === null) a = ti; b = ti + 1; lastT = ti;
      if (d[qi] === ref[ti] || ref[ti] === 'N') I.push({ ci: ti });
      else { I.push({ b: d[qi], r: ti }); changes.push(`${ref[ti]}${ti + 1}${d[qi]}`); subs.push({ r: ti, from: ref[ti], to: d[qi] }); first = Math.min(first, ti); lastC = Math.max(lastC, ti); }
    } else if (qi >= 0) {
      if (a === null) continue;
      I.push({ b: d[qi] }); changes.push(`ins ${d[qi]} after ${lastT + 1}`); first = Math.min(first, lastT + 1); lastC = Math.max(lastC, lastT + 1);
    } else {
      if (a === null) continue;
      changes.push(`del ${ref[ti]}${ti + 1}`); b = ti + 1; lastT = ti; first = Math.min(first, ti); lastC = Math.max(lastC, ti);
    }
  }
  if (!changes.length) { warnings.push('The donor matches the control sequence exactly, so HDR cannot be distinguished from wild type.'); return null; }
  const net = I.length - (b - a);
  return { spec: { a, I, b }, net, changes: compressChanges(changes), subs, firstChange: first, lastChange: lastC, reversed: useRev };
}
function compressChanges(ch) {
  const out = []; for (const c of ch) { const p = out[out.length - 1]; if (p && c.startsWith('ins ') && p.startsWith('ins ') && c.slice(6) === p.slice(p.indexOf(' after'))) out[out.length - 1] = p.replace(/ins (\w+)/, (m, s) => 'ins ' + s + c[4]); else out.push(c); }
  return out.length > 12 ? [...out.slice(0, 12), `…and ${out.length - 12} more`] : out;
}


// Donor allele that also carries an indel at the cut, expressed in reference coordinates.
function composeHDR(ref, hdrSpec, dSpec, jEnd) {
  const refOf = j => { const t = tokenAt(hdrSpec, j); return t.ci !== undefined ? t.ci : t.r !== undefined ? t.r : null; };
  let ja = null, jb = null;
  for (let j = 0; j <= jEnd + 40; j++) {
    const r = refOf(j); if (r === null) continue;
    if (ja === null && r >= dSpec.a) ja = j;
    if (jb === null && r >= dSpec.b) { jb = j; break; }
  }
  if (ja === null || jb === null || jb < ja) return null;
  const a = Math.min(ja, hdrSpec.a), I = [];
  for (let j = a; j < ja; j++) I.push(tokenAt(hdrSpec, j));
  for (const t of dSpec.I) I.push(t);
  for (let j = jb; j < jEnd; j++) I.push(tokenAt(hdrSpec, j));
  const b = refOf(jEnd); if (b === null) return null;
  return { a, I, b };
}

// ---------- Candidate alleles ----------
function tokenAt(spec, j) {
  if (j < spec.a) return { ci: j };
  const k = j - spec.a;
  if (k < spec.I.length) return spec.I[k];
  return { ci: spec.b + k - spec.I.length };
}
function applySpec(ref, spec, fillN = 'N') {
  return ref.slice(0, spec.a) + spec.I.map(t => t.ci !== undefined ? ref[t.ci] : (t.b || fillN)).join('') + ref.slice(spec.b);
}
function specColumns(ref, spec) {
  const cols = [];
  for (let r = 0; r < Math.min(spec.a, ref.length); r++) cols.push({ r, R: ref[r], A: ref[r], t: 'm' });
  let r = spec.a;
  for (const tk of spec.I) {
    if (tk.ci !== undefined || tk.r !== undefined) {
      const tgt = tk.ci !== undefined ? tk.ci : tk.r;
      while (r < tgt) { cols.push({ r, R: ref[r], A: '-', t: 'd' }); r++; }
      cols.push(tk.ci !== undefined ? { r, R: ref[r], A: ref[r], t: 'm' } : { r, R: ref[r], A: tk.b, t: 's' }); r++;
    } else cols.push({ r: r - 0.5, R: '-', A: tk.b || 'N', t: 'i' });
  }
  while (r < spec.b) { cols.push({ r, R: ref[r], A: '-', t: 'd' }); r++; }
  for (let q = spec.b; q < ref.length; q++) cols.push({ r: q, R: ref[q], A: ref[q], t: 'm' });
  return cols;
}

// ---------- NNLS (Lawson–Hanson on the Gram matrix) ----------
function cholSolve(M, b, q) {
  const L = new Float64Array(q * q);
  for (let i = 0; i < q; i++) for (let j = 0; j <= i; j++) {
    let s = M[i * q + j]; for (let k = 0; k < j; k++) s -= L[i * q + k] * L[j * q + k];
    if (i === j) L[i * q + i] = Math.sqrt(Math.max(s, 1e-14)); else L[i * q + j] = s / L[j * q + j];
  }
  const y = new Float64Array(q);
  for (let i = 0; i < q; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * q + k] * y[k]; y[i] = s / L[i * q + i]; }
  const x = new Float64Array(q);
  for (let i = q - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < q; k++) s -= L[k * q + i] * x[k]; x[i] = s / L[i * q + i]; }
  return x;
}
function nnlsGram(G, h, n) {
  const x = new Float64Array(n), inP = new Uint8Array(n), banned = new Uint8Array(n), w = new Float64Array(n);
  let ridge = 0; for (let i = 0; i < n; i++) ridge += G[i * n + i]; ridge = 1e-9 * ridge / n;
  const tol = 1e-12;
  for (let it = 0; it < 3 * n; it++) {
    const P = []; for (let i = 0; i < n; i++) if (inP[i]) P.push(i);
    for (let i = 0; i < n; i++) { let s = h[i]; for (const j of P) s -= G[i * n + j] * x[j]; w[i] = s; }
    let jm = -1, wm = 1e-10;
    for (let i = 0; i < n; i++) if (!inP[i] && !banned[i] && w[i] > wm) { wm = w[i]; jm = i; }
    if (jm < 0) break;
    inP[jm] = 1;
    for (let inner = 0; inner < n; inner++) {
      const Q = []; for (let i = 0; i < n; i++) if (inP[i]) Q.push(i);
      if (!Q.length) break;
      const q = Q.length, M = new Float64Array(q * q), rhs = new Float64Array(q);
      for (let a = 0; a < q; a++) { rhs[a] = h[Q[a]]; for (let b = 0; b < q; b++) M[a * q + b] = G[Q[a] * n + Q[b]] + (a === b ? ridge : 0); }
      const s = cholSolve(M, rhs, q);
      if (s.every(v => v > tol)) { Q.forEach((i, k) => x[i] = s[k]); break; }
      let alpha = Infinity;
      Q.forEach((i, k) => { if (s[k] <= tol) { const den = x[i] - s[k]; const a = den > 0 ? x[i] / den : 0; if (a < alpha) alpha = a; } });
      Q.forEach((i, k) => { x[i] += alpha * (s[k] - x[i]); });
      for (const i of Q) if (x[i] <= tol) { inP[i] = 0; x[i] = 0; if (i === jm && inner === 0) banned[i] = 1; }
    }
  }
  return x;
}

// ---------- Main analysis ----------
function analyzeSample({ control, edited, reference, guide, nuclease = 'SpCas9', donor = '', opts = {} }) {
  const o = Object.assign({ maxDel: 30, maxIns: 10, maxLeft: 15, after: 100 }, opts);
  const warnings = [];
  if (!edited) throw new Error('Choose an edited trace.');
  let ref, ctrlFrac = null, refEnd;
  if (control) {
    ref = control.seq; ctrlFrac = peakFractions(control); refEnd = usableEnd(control);
    if (refEnd < ref.length - 5) warnings.push(`Control read quality drops after base ${refEnd}; analysis stops there.`);
  } else {
    ref = cleanSeq(reference);
    if (ref.length < 60) throw new Error('Choose a control trace, or paste a reference sequence of at least 60 bp.');
    refEnd = ref.length;
    warnings.push('No control trace: expected peaks are modeled from the reference sequence alone, so background noise is not subtracted.');
  }
  const basisAt = i => ctrlFrac ? ctrlFrac[i] : oneHot(ref[i]);
  const g = findGuide(ref, guide, nuclease);
  if (g.mismatches) warnings.push(`Guide matches the control read with ${g.mismatches} mismatch${g.mismatches > 1 ? 'es' : ''} (possible base-calling errors).`);
  if (!g.pamOk) warnings.push(`Expected PAM ${g.pam} not found next to the guide (read shows ${g.pamSeq || 'nothing'}).`);
  const cut = g.cut;

  let hdr = null;
  if (cleanSeq(donor).length) hdr = buildHDR(ref, donor, warnings);

  let ws = cut - o.maxLeft - 2;
  if (hdr && hdr.firstChange - 2 < ws) ws = hdr.firstChange - 2;
  const aEnd = ws, aStart = Math.max(0, aEnd - 40);
  if (aEnd - aStart < 15) throw new Error(`The cut site (base ${cut}) is too close to the start of the control read to anchor the alignment. Use a sequencing primer further upstream.`);
  if (aStart < 25) warnings.push('The alignment anchor sits in the first ~25 bases of the read, where Sanger quality is usually poor.');

  // Align edited read (try both orientations)
  let ed = edited, anc = anchorOffset(ref, aStart, aEnd, edited.seq);
  if (!anc || anc.identity < 0.8) {
    const rc = reverseTrace(edited), anc2 = anchorOffset(ref, aStart, aEnd, rc.seq);
    if (anc2 && (!anc || anc2.identity > anc.identity)) { ed = rc; anc = anc2; warnings.push('The edited read was reverse-complemented to match the control orientation.'); }
  }
  if (!anc) throw new Error('The edited read does not align to the control upstream of the cut site. Check that the files are paired correctly and come from the same amplicon.');
  if (anc.identity < 0.8) warnings.push(`Only ${Math.round(anc.identity * 100)}% identity between control and edited reads upstream of the cut; results may be unreliable.`);
  const offset = anc.offset;
  const edFrac = peakFractions(ed);

  const maxShift = Math.max(o.maxDel, hdr ? -hdr.net : 0, 0) + 1;
  const we = Math.min(cut + o.after, refEnd - maxShift, ed.seq.length - offset);
  if (we - ws < 30) throw new Error('Not enough usable sequence downstream of the cut site in both reads (need ≥ 30 bp). Use primers that place the cut site nearer the middle of the read.');
  if (hdr && hdr.lastChange >= we) warnings.push('Some donor changes lie beyond the analysis window and are not used to score HDR.');

  // Candidates
  const cands = [{ label: 'Wild type', indel: 0, kind: 'wt', spec: { a: ref.length, I: [], b: ref.length } }];
  if (hdr) cands.push({ label: 'HDR (donor)', indel: hdr.net, kind: 'hdr', spec: hdr.spec });
  for (let d = 1; d <= o.maxDel; d++)
    for (let s = Math.max(cut - d, cut - o.maxLeft, 0); s <= cut; s++)
      cands.push({ label: `−${d}`, indel: -d, kind: 'del', spec: { a: s, I: [], b: s + d } });
  for (const b of BASES) cands.push({ label: `+1 (${b})`, indel: 1, kind: 'ins', spec: { a: cut, I: [{ b }], b: cut } });
  for (let n = 2; n <= o.maxIns; n++) {
    cands.push({ label: `+${n}`, indel: n, kind: 'ins', spec: { a: cut, I: Array.from({ length: n }, () => ({ n: 1 })), b: cut } });
    if (cut - n >= 0) cands.push({ label: `+${n} (dup)`, indel: n, kind: 'ins', spec: { a: cut, I: Array.from({ length: n }, (_, k) => ({ b: ref[cut - n + k] })), b: cut } });
  }
  // Donor change retained alongside an indel (partial HDR / HDR with an indel at the cut)
  if (hdr) {
    const jEnd = we + maxShift + 2;
    const base = cands.filter(c => c.kind === 'del' || c.kind === 'ins');
    for (const c of base) {
      const sp = composeHDR(ref, hdr.spec, c.spec, jEnd);
      if (sp) cands.push({ label: `donor + ${c.label}`, indel: c.indel, kind: 'hdrindel', spec: sp, delAt: c.kind === 'del' ? c.spec.a : null });
    }
  }

  const m = (we - ws) * 4;
  const cols = [], kept = [], seen = new Map();
  for (const c of cands) {
    let key = ''; const col = new Float64Array(m); let ok = true;
    for (let j = ws; j < we; j++) {
      const tk = tokenAt(c.spec, j); let v;
      if (tk.ci !== undefined) { if (tk.ci >= ref.length) { ok = false; break; } v = basisAt(tk.ci); key += 'c' + tk.ci; }
      else if (tk.b) { v = oneHot(tk.b); key += tk.b; } else { v = UNIFORM; key += 'n'; }
      const o4 = (j - ws) * 4; col[o4] = v[0]; col[o4 + 1] = v[1]; col[o4 + 2] = v[2]; col[o4 + 3] = v[3];
    }
    if (!ok) continue;
    if (seen.has(key)) { seen.get(key).aliases++; continue; }
    c.aliases = 1; seen.set(key, c); cols.push(col); kept.push(c);
  }
  const obs = new Float64Array(m);
  for (let j = ws; j < we; j++) { const v = edFrac[j + offset]; for (let k = 0; k < 4; k++) obs[(j - ws) * 4 + k] = v[k]; }

  const n = cols.length, G = new Float64Array(n * n), h = new Float64Array(n);
  for (let a = 0; a < n; a++) {
    const ca = cols[a]; let s = 0; for (let r = 0; r < m; r++) s += ca[r] * obs[r]; h[a] = s;
    for (let b = a; b < n; b++) { const cb = cols[b]; let t = 0; for (let r = 0; r < m; r++) t += ca[r] * cb[r]; G[a * n + b] = G[b * n + a] = t; }
  }
  const x = nnlsGram(G, h, n);
  const pred = new Float64Array(m);
  for (let a = 0; a < n; a++) if (x[a] > 0) { const ca = cols[a]; for (let r = 0; r < m; r++) pred[r] += x[a] * ca[r]; }
  let ssr = 0, sst = 0, mean = 0; for (let r = 0; r < m; r++) mean += obs[r]; mean /= m;
  for (let r = 0; r < m; r++) { ssr += (obs[r] - pred[r]) ** 2; sst += (obs[r] - mean) ** 2; }
  const r2 = 1 - ssr / sst;
  const total = x.reduce((s, v) => s + v, 0) || 1;
  const contribs = kept.map((c, i) => ({ ...c, weight: x[i] / total })).filter(c => c.weight > 0.001).sort((a, b) => b.weight - a.weight);

  const sum = f => contribs.filter(f).reduce((s, c) => s + c.weight, 0);
  const isIndel = c => c.kind === 'del' || c.kind === 'ins' || c.kind === 'hdrindel';
  const indelPct = sum(isIndel);
  const koScore = sum(c => isIndel(c) && (Math.abs(c.indel) % 3 !== 0 || Math.abs(c.indel) >= 21));
  const kiScore = hdr ? sum(c => c.kind === 'hdr') : null;
  const wtPct = sum(c => c.kind === 'wt');
  if (r2 < 0.8) warnings.push('Model fit is low (R² < 0.8). Possible causes: deletions larger than the maximum, a mismatched control, a noisy edited read, or more than one guide.');
  const partial = sum(c => c.kind === 'hdrindel');
  if (partial > 0.05) warnings.push(`${Math.round(partial * 100)}% of alleles carry donor changes together with an indel at the cut. These are counted as indels, not as knock-in.`);
  if (indelPct > 0.02 && contribs.some(c => (c.kind === 'del' || c.kind === 'hdrindel') && -c.indel >= o.maxDel - 2 && c.weight > 0.05))
    warnings.push(`A large share of deletions is near the ${o.maxDel} bp limit; try raising the maximum deletion size.`);

  // Per-site donor concordance
  let donorSites = null;
  if (hdr && hdr.subs.length) {
    donorSites = hdr.subs.map(sb => {
      const k = sb.r + offset, j = BI[sb.to], jf = BI[sb.from];
      const covered = k >= 0 && k < edFrac.length && j !== undefined;
      return { pos: sb.r + 1, from: sb.from, to: sb.to, inWindow: sb.r >= ws && sb.r < we,
        edited: covered ? edFrac[k][j] : null, editedRef: covered ? edFrac[k][jf] : null,
        control: ctrlFrac && jf !== undefined ? ctrlFrac[sb.r][j] : null };
    });
    const seen = donorSites.filter(d => d.edited != null).map(d => d.edited);
    if (seen.length > 1 && Math.max(...seen) - Math.min(...seen) > 0.4) {
      const got = donorSites.filter(d => d.edited != null && d.edited > 0.6).map(d => `${d.from}${d.pos}${d.to}`);
      const miss = donorSites.filter(d => d.edited != null && d.edited < 0.2).map(d => `${d.from}${d.pos}${d.to}`);
      warnings.push(`The read carries some donor changes but not others (present: ${got.join(', ') || 'none'}; absent: ${miss.join(', ') || 'none'}). Partial donor conversion, or the donor sequence entered does not match the one used. The knock-in score counts only alleles carrying every donor change, so it will read low.`);
    }
  }

  // Discordance
  const disc = { ctrl: [], ed: [] };
  for (let i = 0; i < ref.length; i++) {
    const bi = BI[ref[i]];
    disc.ctrl.push(ctrlFrac && bi !== undefined ? 1 - ctrlFrac[i][bi] : null);
    const k = i + offset; disc.ed.push(bi !== undefined && k >= 0 && k < edFrac.length ? 1 - edFrac[k][bi] : null);
  }
  const meanOf = (arr, a, b) => { let s = 0, c = 0; for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) if (arr[i] != null) { s += arr[i]; c++; } return c ? s / c : null; };
  const discordance = {
    edBefore: meanOf(disc.ed, aStart, aEnd), edAfter: meanOf(disc.ed, cut, we),
    ctrlBefore: meanOf(disc.ctrl, aStart, aEnd), ctrlAfter: meanOf(disc.ctrl, cut, we),
  };

  return {
    ref, cut, guide: g, hdr, offset, ws, we, aStart, aEnd, anchorIdentity: anc.identity,
    donorSites, contribs, indelPct, koScore, kiScore, partialHDR: hdr ? partial : null, wtPct, r2, nCandidates: n, warnings,
    disc, discordance, ctrlFrac, edFrac, control, edited: ed, opts: o,
  };
}

// ---------- Demo data (synthetic traces) ----------
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashCtx(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
function simulateTrace(name, alleles, start, len, R) {
  const sp = 12, N = len * sp + 40;
  const tr = { A: new Float32Array(N), C: new Float32Array(N), G: new Float32Array(N), T: new Float32Array(N) };
  const ploc = [], seq = [], qual = [];
  for (let k = 0; k < len; k++) {
    const p = 20 + k * sp + Math.round((R() - 0.5) * 2); ploc.push(p);
    const h = [0, 0, 0, 0];
    for (const a of alleles) {
      const pos = start + k, b = a.seq[pos]; if (!b || BI[b] === undefined) continue;
      h[BI[b]] += (0.5 + hashCtx(a.seq.substr(Math.max(0, pos - 2), 3))) * 1000 * a.w;
    }
    for (let c = 0; c < 4; c++) h[c] += 1000 * 0.035 * R();
    BASES.forEach((b, c) => { for (let d = -12; d <= 12; d++) { const q = p + d; if (q >= 0 && q < N) tr[b][q] += h[c] * Math.exp(-(d * d) / (2 * 3.2 * 3.2)); } });
    let mi = 0; for (let c = 1; c < 4; c++) if (h[c] > h[mi]) mi = c;
    const purity = h[mi] / (h[0] + h[1] + h[2] + h[3]);
    seq.push(BASES[mi]); qual.push(Math.round(8 + 50 * purity ** 4));
  }
  const toI = a => Int16Array.from(a, v => Math.min(32000, Math.round(v)));
  return { name, seq: seq.join(''), ploc, qual, traces: { A: toI(tr.A), C: toI(tr.C), G: toI(tr.G), T: toI(tr.T) }, synthetic: true };
}
function makeDemo() {
  const R = mulberry(7);
  const rnd = n => Array.from({ length: n }, () => BASES[Math.floor(R() * 4)]).join('');
  const guide1 = 'GACCTGTCAGTTGCAAGCTA', guide2 = 'TCCGAGATCGTGACAACGTT';
  const ref = rnd(240) + guide1 + 'TGG' + rnd(150) + 'CCA' + revcomp(guide2) + rnd(270);
  const cut1 = 240 + 17;
  const pos2 = ref.indexOf(revcomp(guide2)); const cut2 = pos2 + 3;
  const al = (spec, w) => ({ seq: applySpec(ref, spec, 'G'), w });
  const WT = { a: ref.length, I: [], b: ref.length };
  const ko = [al(WT, 0.17), al({ a: cut1, I: [], b: cut1 + 1 }, 0.41), al({ a: cut1, I: [{ b: ref[cut1 - 1] }], b: cut1 }, 0.23), al({ a: cut1 - 3, I: [], b: cut1 + 4 }, 0.11), al({ a: cut1 - 9, I: [], b: cut1 + 4 }, 0.08)];
  // SNP knock-in: substitution 4 bp from cut + PAM-blocking silent change
  const snpPos = cut2 + 4, pamPos = pos2 - 2;
  const swap = b => ({ A: 'G', G: 'A', C: 'T', T: 'C' })[b];
  const hdrSeq = ref.slice(0, pamPos) + swap(ref[pamPos]) + ref.slice(pamPos + 1, snpPos) + swap(ref[snpPos]) + ref.slice(snpPos + 1);
  const donor = hdrSeq.slice(cut2 - 45, cut2 + 46);
  const ki = [al(WT, 0.44), { seq: hdrSeq, w: 0.31 }, al({ a: cut2 - 2, I: [], b: cut2 }, 0.15), al({ a: cut2, I: [{ b: ref[cut2 - 1] }], b: cut2 }, 0.10)];
  const ctrl = simulateTrace('example_control.ab1', [{ seq: ref, w: 1 }], 0, ref.length - 5, R);
  const e1 = simulateTrace('example_KO_edited.ab1', ko, 14, ref.length - 60, R);
  const e2 = simulateTrace('example_SNP_edited.ab1', ki, 9, ref.length - 60, R);
  return { files: [ctrl, e1, e2], samples: [
    { name: 'Example knockout', controlName: ctrl.name, editedName: e1.name, guide: guide1, nuclease: 'SpCas9', donor: '' },
    { name: 'Example SNP knock-in', controlName: ctrl.name, editedName: e2.name, guide: guide2, nuclease: 'SpCas9', donor },
  ] };
}


if (typeof module !== 'undefined' && module.exports) module.exports = { parseAB1, analyzeSample, makeDemo, revcomp, reverseTrace, cleanSeq, findGuide, specColumns, applySpec, peakFractions, localAlign, usableEnd, NUCLEASES };
