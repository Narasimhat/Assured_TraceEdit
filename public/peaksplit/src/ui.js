// ================= Peaksplit UI =================
const state = { files: new Map(), samples: [], results: new Map(), selected: null, settings: { maxDel: 30, maxIns: 10, maxLeft: 15, after: 100 } };
let uid = 0; const nid = () => 'i' + (++uid);
let inputRevision = 0;
function invalidateResults(id) {
  inputRevision++;
  if (id) state.results.delete(id); else state.results.clear();
  renderSummary(); renderDetail();
  $('#resultsSec').hidden = state.results.size === 0;
  $('#bulkMsg').textContent = 'Inputs changed. Reanalyze affected samples to update results.';
}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => v == null ? '—' : (v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0) + '%';
const CTRL_RE = /(ctrl|control|\bwt\b|_wt|wt_|wild|parental|mock|untreated|unedited|neg)/i;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let projectRevision = 0, previousProject = null;
function resetProject() {
  if (state.files.size || state.samples.length) previousProject = {
    files: new Map(state.files), samples: state.samples, results: new Map(state.results),
    selected: state.selected, settings: {...state.settings},
    guide: $('#guideAll').value, donor: $('#donorAll').value
  };
  projectRevision++; inputRevision++;
  state.files.clear(); state.samples = []; state.results.clear(); state.selected = null;
  state.settings = {maxDel:30,maxIns:10,maxLeft:15,after:100};
  $('#guideAll').value = ''; $('#donorAll').value = '';
  $('#fileInput').value = ''; $('#sheetInput').value = '';
  refreshProject();
  $('#bulkMsg').textContent = 'Empty project. Add matching control and edited reads. The previous project can be restored until this tab closes or another project replaces it.';
}
function refreshProject() {
  document.querySelectorAll('[data-set]').forEach(el => el.value = state.settings[el.dataset.set]);
  $('#restoreProject').disabled = !previousProject;
  renderFiles(); renderSamples(); renderSummary(); renderDetail();
  $('#resultsSec').hidden = state.results.size === 0;
}
function restoreProject() {
  if (!previousProject) return;
  const saved = previousProject;
  previousProject = {files:new Map(state.files),samples:state.samples,results:new Map(state.results),selected:state.selected,settings:{...state.settings},guide:$('#guideAll').value,donor:$('#donorAll').value};
  projectRevision++; inputRevision++;
  Object.assign(state,{files:saved.files,samples:saved.samples,results:saved.results,selected:saved.selected,settings:saved.settings});
  $('#guideAll').value = saved.guide; $('#donorAll').value = saved.donor;
  refreshProject(); $('#bulkMsg').textContent = 'Previous project restored, including its results.';
}

// ---------- Files ----------
async function addFiles(list) {
  const revision = projectRevision;
  const sheets = [];
  for (const f of list) {
    if (/\.(csv|tsv|txt)$/i.test(f.name)) { sheets.push(f); continue; }
    const id = nid();
    try { const bytes = await f.arrayBuffer(); if(revision !== projectRevision)return; state.files.set(id, { id, name: f.name, trace: parseAB1(bytes, f.name) }); }
    catch (e) { if(revision !== projectRevision)return; state.files.set(id, { id, name: f.name, error: e.message }); }
  }
  for (const s of sheets) { const text = await s.text(); if(revision !== projectRevision)return; importSheet(text); }
  resolveNames();
  if (!sheets.length) autoPair();
  renderFiles(); renderSamples();
}
function fileByName(n) {
  if (!n) return null; const k = n.trim().toLowerCase(), base = k.replace(/\.(ab1|abi)$/, '');
  const matches = [...state.files.values()].filter(f => { const fn = f.name.toLowerCase(); return f.trace && (fn === k || fn.replace(/\.(ab1|abi)$/, '') === base); });
  // A duplicate filename across projects must not resolve to the first read.
  return matches.length === 1 ? matches[0] : null;
}
function resolveNames() {
  for (const s of state.samples) {
    if (!s.controlId && s.controlName) { const f = fileByName(s.controlName); if (f) s.controlId = f.id; }
    if (!s.editedId && s.editedName) { const f = fileByName(s.editedName); if (f) s.editedId = f.id; }
  }
}
function autoPair() {
  const used = new Set(); state.samples.forEach(s => { used.add(s.controlId); used.add(s.editedId); });
  const good = [...state.files.values()].filter(f => f.trace);
  const ctrls = good.filter(f => CTRL_RE.test(f.name));
  for (const f of good) {
    if (used.has(f.id) || ctrls.includes(f)) continue;
    // Prefix similarity does not establish matching amplicons or parental lines.
    state.samples.push(newSample({ name: f.name.replace(/\.(ab1|abi)$/i, ''), controlId: '', editedId: f.id }));
  }
}
function newSample(p = {}) {
  return Object.assign({ id: nid(), name: `Sample ${state.samples.length + 1}`, controlId: '', editedId: '', guide: '', nuclease: 'SpCas9', donor: '', reference: '' }, p);
}
function parseCSV(text) {
  const delim = text.split('\n')[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function importSheet(text) {
  const rows = parseCSV(text); if (!rows.length) return;
  const h = rows[0].map(x => x.trim().toLowerCase());
  const find = re => h.findIndex(x => re.test(x));
  let idx = { label: find(/label|sample|name/), ctrl: find(/control|ctrl/), ed: find(/edit|experiment|test|treated/), guide: find(/guide|sgrna|grna|spacer/), donor: find(/donor|hdr|template/), nuc: find(/nuclease|enzyme|cas/) };
  let body = rows.slice(1);
  if (idx.ctrl < 0 && idx.guide < 0) { idx = { label: 0, ctrl: 1, ed: 2, guide: 3, donor: 4, nuc: -1 }; body = rows; }
  const get = (r, i) => i >= 0 && r[i] != null ? r[i].trim() : '';
  for (const r of body) {
    const nuc = get(r, idx.nuc); const nk = Object.keys(NUCLEASES).find(k => nuc && (k.toLowerCase() === nuc.toLowerCase() || NUCLEASES[k].label.toLowerCase().startsWith(nuc.toLowerCase())));
    state.samples.push(newSample({ name: get(r, idx.label) || `Sample ${state.samples.length + 1}`, controlName: get(r, idx.ctrl), editedName: get(r, idx.ed), guide: get(r, idx.guide), donor: get(r, idx.donor), nuclease: nk || 'SpCas9' }));
  }
}

function renderFiles() {
  const ul = $('#fileList');
  ul.innerHTML = [...state.files.values()].map(f => {
    let meta;
    if (f.error) meta = `<span class="bad">${esc(f.error)}</span>`;
    else { const q = f.trace.qual; const mq = q ? Math.round(q.reduce((a, b) => a + b, 0) / q.length) : null; meta = `${f.trace.seq.length} bases${mq != null ? `, mean quality ${mq}` : ''}${CTRL_RE.test(f.name) ? ', looks like a control' : ''}`; }
    return `<li><div><div class="fn">${esc(f.name)}</div><div class="meta">${meta}</div></div><button class="x" data-rmfile="${f.id}" aria-label="Remove ${esc(f.name)}">×</button></li>`;
  }).join('');
}

// ---------- Samples ----------
function fileOptions(sel, allowNone) {
  const opts = [...state.files.values()].filter(f => f.trace);
  return (allowNone ? `<option value="">None — use reference sequence</option>` : `<option value="">Choose a trace</option>`) +
    opts.map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}
function renderSamples() {
  const box = $('#sampleList');
  if (!state.samples.length) { box.innerHTML = `<div class="empty">Add .ab1 files, then choose the matching control for each sample or import an explicit sample sheet. A filename containing WT does not establish a matching amplicon.</div>`; return; }
  box.innerHTML = state.samples.map(s => {
    const missing = [s.controlName && !s.controlId ? s.controlName : null, s.editedName && !s.editedId ? s.editedName : null].filter(Boolean);
    return `<div class="sample" data-sid="${s.id}">
    <div class="sample-grid">
      <label class="f"><span>Sample name</span><input type="text" data-f="name" value="${esc(s.name)}"></label>
      <label class="f"><span>Control trace</span><select data-f="controlId">${fileOptions(s.controlId, true)}</select></label>
      <label class="f"><span>Edited trace</span><select data-f="editedId">${fileOptions(s.editedId, false)}</select></label>
      <label class="f"><span>Guide, 5′→3′ without PAM</span><input type="text" class="mono" data-f="guide" value="${esc(s.guide)}" spellcheck="false" autocomplete="off"></label>
      <label class="f"><span>Nuclease</span><select data-f="nuclease">${Object.entries(NUCLEASES).map(([k, v]) => `<option value="${k}" ${k === s.nuclease ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <button class="x" data-rmsample="${s.id}" aria-label="Remove sample ${esc(s.name)}" title="Remove sample">×</button>
    </div>
    ${missing.length ? `<p class="hint" style="color:var(--warn)">Waiting for ${missing.map(esc).join(' and ')} — add ${missing.length > 1 ? 'these files' : 'this file'} above.</p>` : ''}
    <details ${s.donor || s.reference ? 'open' : ''}><summary>Donor template${s.donor ? ' (set)' : ''} and reference</summary>
      <div class="extra">
        <label class="f"><span>Donor or expected HDR sequence — for SNP knock-ins. Leave empty for knockouts.</span><textarea class="mono" data-f="donor" spellcheck="false">${esc(s.donor)}</textarea></label>
        <label class="f"><span>Reference amplicon — only used when there is no control trace</span><textarea class="mono" data-f="reference" spellcheck="false">${esc(s.reference)}</textarea></label>
      </div>
    </details></div>`;
  }).join('');
}

// ---------- Run ----------
async function runAll() {
  const btn = $('#runBtn'); if (!state.samples.length) return;
  const revision = inputRevision;
  btn.disabled = true; btn.textContent = 'Analyzing…';
  state.results.clear();
  $('#resultsSec').hidden = false;
  for (const s of state.samples) {
    renderSummary(s.id);
    await new Promise(r => setTimeout(r, 15));
    if (revision !== inputRevision) break;
    const ctrl = state.files.get(s.controlId), ed = state.files.get(s.editedId);
    try {
      const res = analyzeSample({ control: ctrl && ctrl.trace, edited: ed && ed.trace, reference: s.reference, guide: s.guide, nuclease: s.nuclease, donor: s.donor, opts: state.settings });
      state.results.set(s.id, { ok: true, res, sample: { ...s, controlName: ctrl ? ctrl.name : '', editedName: ed ? ed.name : '' } });
    } catch (e) { state.results.set(s.id, { ok: false, error: e.message, sample: { ...s } }); console.error(e); }
  }
  if (!state.results.has(state.selected)) state.selected = state.samples[0]?.id;
  renderSummary(); renderDetail();
  btn.disabled = false; btn.textContent = 'Analyze samples';
}

function renderSummary(running) {
  const hasKI = [...state.results.values()].some(r => r.ok && r.res.kiScore != null) || state.samples.some(s => s.donor);
  const rows = state.samples.map(s => {
    const r = state.results.get(s.id);
    let cells;
    if (!r) cells = `<td class="num">—</td><td class="num">—</td>${hasKI ? '<td class="num">—</td>' : ''}<td class="num">—</td><td>${s.id === running ? 'Analyzing…' : 'Waiting'}</td>`;
    else if (!r.ok) cells = `<td class="num">—</td><td class="num">—</td>${hasKI ? '<td class="num">—</td>' : ''}<td class="num">—</td><td class="status-err">Could not analyze</td>`;
    else { const x = r.res; cells = `<td class="num">${pct(x.indelPct)}</td><td class="num">${pct(x.koScore)}</td>${hasKI ? `<td class="num">${x.kiScore == null ? '—' : pct(x.kiScore)}</td>` : ''}<td class="num">${x.r2.toFixed(2)}</td><td>${x.warnings.length ? `${x.warnings.length} note${x.warnings.length > 1 ? 's' : ''}` : 'OK'}</td>`; }
    return `<tr data-sel="${s.id}" class="${s.id === state.selected ? 'sel' : ''}" tabindex="0"><td>${esc(s.name)}</td>${cells}</tr>`;
  }).join('');
  $('#summary').innerHTML = `<thead><tr><th>Sample</th><th class="num">Indel</th><th class="num">Knockout score</th>${hasKI ? '<th class="num">Knock-in score</th>' : ''}<th class="num">R²</th><th>Status</th></tr></thead><tbody>${rows}</tbody>`;
}

// ---------- Detail ----------
function renderDetail() {
  const box = $('#detail'); const r = state.results.get(state.selected);
  if (!r) { box.innerHTML = ''; return; }
  const s = r.sample;
  if (!r.ok) { box.innerHTML = `<div class="detail-head"><div><h3>${esc(s.name)}</h3></div></div><div class="errbox">${esc(r.error)}</div>`; return; }
  const x = r.res, g = x.guide;
  const stats = [
    ['Indel', pct(x.indelPct)], ['Knockout score', pct(x.koScore)],
    ...(x.kiScore != null ? [['Knock-in score', pct(x.kiScore)]] : []),
    ...(x.partialHDR > 0.02 ? [['Donor plus indel', pct(x.partialHDR)]] : []), ['Wild type', pct(x.wtPct)], ['Model fit R²', x.r2.toFixed(2)],
  ];
  box.innerHTML = `
  <div class="detail-head"><div><h3>${esc(s.name)}</h3>
    <p>${esc(s.editedName)}${s.controlName ? ` against ${esc(s.controlName)}` : ' against pasted reference'}</p></div></div>
  <div class="stats">${stats.map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
  ${x.warnings.length ? `<ul class="notes">${x.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

  ${donorSiteHTML(x)}
  <div class="fig"><h3>Discordance</h3>
    <p class="cap">Share of signal at each position that disagrees with the control base. Edited and control should agree before the cut site and diverge after it if editing occurred.</p>
    <canvas class="plot" id="cvDisc" role="img" aria-label="Discordance plot of control and edited reads"></canvas>
    <div class="legend"><span><i class="key" style="background:${css('--muted')}"></i>Control</span><span><i class="key" style="background:${css('--T')}"></i>Edited</span><span><i class="key blk" style="background:#E7EEF4;border:1px solid var(--line)"></i>Alignment window</span><span><i class="key blk" style="background:var(--guide)"></i>Inference window</span><span>Dashed line: cut site</span></div>
  </div>

  <div class="fig"><h3>Traces at the cut site</h3>
    <p class="cap">Guide shaded blue, PAM amber. Labelled columns mark positions that differ from the control: green for a donor change that converted, red for a donor change that did not or for a clean substitution, amber for a mixed position. Numbers along the bottom are control-read coordinates.</p>
    ${x.control ? `<div class="tracelabel">Control</div><canvas class="plot" id="cvCtrl" role="img" aria-label="Control chromatogram"></canvas>` : ''}
    <div class="tracelabel">Edited</div><canvas class="plot" id="cvEd" role="img" aria-label="Edited chromatogram"></canvas>
    <div class="legend">${BASES.map(b => `<span><i class="key" style="background:${css('--' + b)}"></i>${b}</span>`).join('')}<span><i class="key blk" style="background:var(--guide)"></i>Guide</span><span><i class="key blk" style="background:var(--pam)"></i>PAM</span><span><i class="key blk" style="background:rgba(28,154,75,.3)"></i>Donor change present</span><span><i class="key blk" style="background:rgba(212,58,47,.3)"></i>Change absent or substitution</span><span><i class="key blk" style="background:rgba(122,80,0,.3)"></i>Mixed peak</span></div>
  </div>

  <div class="fig two">
    <div><h3>Indel distribution</h3>
      <p class="cap">Inferred share of each outcome, grouped by size.</p>
      ${distHTML(x)}
      <div class="legend"><span><i class="key blk k-fs"></i>Frameshift or ≥ 21 bp</span><span><i class="key blk k-if"></i>In-frame</span><span><i class="key blk k-wt"></i>Wild type</span>${x.hdr ? '<span><i class="key blk k-hdr"></i>HDR</span>' : ''}</div>
    </div>
    <div><h3>Inferred alleles</h3>
      <p class="cap">Alleles above 1%, aligned to the control around the cut. Red dashes are deletions, blue letters insertions (n = unknown base), green letters donor changes.</p>
      <div class="scroll-x">${alleleHTML(x)}</div>
    </div>
  </div>

  <details class="fig" ${x.hdr ? 'open' : ''}><summary><h3 style="display:inline">Base composition across the guide</h3></summary>
    <p class="cap">Per-position signal in the edited read, written on the guide strand 5′→3′. Rows where non-reference signal exceeds the control by more than 5 points are bold — useful for SNP knock-ins and base editing. Positions downstream of the cut also pick up signal from indels, so read them alongside the allele table.</p>
    <div class="scroll-x">${compHTML(x)}</div>
  </details>

  <details class="fig"><summary><h3 style="display:inline">Analysis details</h3></summary>
    <dl class="meta-list" style="margin-top:10px">
      <dt>Guide</dt><dd class="mono">${esc(cleanSeq(s.guide))} (${g.strand === '+' ? 'forward' : 'reverse'} strand, PAM ${esc(g.pamSeq || '—')})</dd>
      <dt>Cut site</dt><dd>between bases ${x.cut} and ${x.cut + 1} of the control read</dd>
      ${x.hdr ? `<dt>Donor changes</dt><dd class="mono">${x.hdr.changes.map(esc).join(', ')}${x.hdr.net ? ` (net ${x.hdr.net > 0 ? '+' : ''}${x.hdr.net} bp)` : ''}</dd>` : ''}
      <dt>Alignment window</dt><dd>bases ${x.aStart + 1}–${x.aEnd} (${Math.round(x.anchorIdentity * 100)}% identity, offset ${x.offset >= 0 ? '+' : ''}${x.offset})</dd>
      <dt>Inference window</dt><dd>bases ${x.ws + 1}–${x.we} (${x.we - x.ws} positions)</dd>
      <dt>Edited discordance</dt><dd>${pct(x.discordance.edBefore)} before the cut, ${pct(x.discordance.edAfter)} after</dd>
      <dt>Candidate alleles</dt><dd>${x.nCandidates} distinct (deletions up to ${x.opts.maxDel} bp, insertions up to ${x.opts.maxIns} bp)</dd>
    </dl>
  </details>`;
  drawAll();
}

function annotations(x) {
  // Positions where the edited read departs from the control
  const hits = [];
  for (let r = Math.max(0, x.ws - 6); r < Math.min(x.ref.length, x.we + 6); r++) {
    const e = x.disc.ed[r], c = x.disc.ctrl[r]; if (e == null) continue;
    if (e - (c == null ? 0 : c) < 0.18) continue;
    const f = x.edFrac[r + x.offset]; if (!f) continue;
    const order = [0, 1, 2, 3].sort((a, b) => f[b] - f[a]);
    hits.push({ r, top: BASES[order[0]], second: BASES[order[1]], mixed: f[order[1]] > 0.2 });
  }
  // A frameshift makes everything downstream mixed; collapse those runs into one band
  const out = []; let i = 0;
  while (i < hits.length) {
    let j = i; while (j + 1 < hits.length && hits[j + 1].r - hits[j].r <= 3) j++;
    const run = hits.slice(i, j + 1);
    if (run.length > 6) {
      const anyMixed = run.some(h => h.mixed);
      out.push({ r: run[0].r, span: run[run.length - 1].r + 1, rank: 1, color: anyMixed ? css('--warn') : css('--T'),
        label: `${anyMixed ? 'mixed' : 'differs'} from ${run[0].r + 1}`, sub: `${run.length} positions` });
    } else for (const h of run) out.push({ r: h.r, span: h.r + 1, rank: 1, color: h.mixed ? css('--warn') : css('--T'),
      label: h.mixed ? `${x.ref[h.r]}${h.r + 1}${h.top}/${h.second}` : `${x.ref[h.r]}${h.r + 1}${h.top}`,
      sub: h.mixed ? 'mixed' : 'changed' });
    i = j + 1;
  }
  // Designed donor changes are always labelled individually and win any overlap
  for (const d of x.donorSites || []) {
    const r = d.pos - 1, v = d.edited;
    for (let k = out.length - 1; k >= 0; k--) if (out[k].span - out[k].r === 1 && out[k].r === r) out.splice(k, 1);
    out.push({ r, span: r + 1, rank: 2, color: v == null ? css('--muted') : v > 0.3 ? css('--A') : css('--T'),
      label: `${d.from}${d.pos}${d.to}`, sub: v == null ? 'donor, not covered' : `donor ${Math.round(v * 100)}%` });
  }
  return out.sort((a, b) => a.r - b.r || b.rank - a.rank).slice(0, 16);
}

function drawAll() {
  const r = state.results.get(state.selected); if (!r || !r.ok) return;
  const x = r.res, ann = annotations(x);
  const cv = $('#cvDisc'); if (cv) drawDisc(cv, x, ann);
  const sites = ann.filter(a => a.span - a.r === 1).map(a => a.r);
  let from = Math.min(x.cut - 22, ...sites.map(s => s - 5)), to = Math.max(x.cut + 28, ...sites.map(s => s + 6));
  if (to - from > 95) { const c = sites.length ? Math.round(sites.reduce((p, q) => p + q, 0) / sites.length + x.cut) / 2 : x.cut; from = Math.round(c - 47); to = from + 95; }
  const marks = sh => ({ guide: [x.guide.start + sh, x.guide.end + sh], pam: [x.guide.pamStart + sh, x.guide.pamEnd + sh], cut: x.cut + sh, refOf: i => i - sh + 1 });
  if ($('#cvCtrl')) drawChrom($('#cvCtrl'), x.control, from, to, marks(0), ann.map(a => ({ ...a, i: a.r, j: a.span })), true);
  drawChrom($('#cvEd'), x.edited, from + x.offset, to + x.offset, marks(x.offset), ann.map(a => ({ ...a, i: a.r + x.offset, j: a.span + x.offset })));
}

function prep(cv, h) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600;
  cv.width = W * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, W, H: h };
}

function drawDisc(cv, x, ann) {
  const { ctx, W, H } = prep(cv, 230);
  const x0 = Math.max(0, x.aStart - 20), x1 = Math.min(x.ref.length, x.we + 30);
  const pl = 36, pr = 10, pt = 22, pb = 26, pw = W - pl - pr, ph = H - pt - pb;
  const X = i => pl + (i - x0) / (x1 - x0) * pw, Y = v => pt + (1 - v) * ph;
  ctx.font = `12px ${css('--sans')}`;
  ctx.fillStyle = '#E7EEF4'; ctx.fillRect(X(x.aStart), pt, X(x.aEnd) - X(x.aStart), ph);
  ctx.fillStyle = css('--guide'); ctx.fillRect(X(x.ws), pt, X(x.we) - X(x.ws), ph);
  ctx.strokeStyle = css('--line'); ctx.lineWidth = 1; ctx.fillStyle = css('--muted');
  for (const v of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(pl, Y(v) + .5); ctx.lineTo(W - pr, Y(v) + .5); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(v === 0.5 ? '0.5' : String(v), pl - 6, Y(v) + 4); }
  const span = x1 - x0, step = span > 400 ? 100 : span > 160 ? 50 : 25;
  ctx.textAlign = 'center';
  for (let t = Math.ceil(x0 / step) * step; t < x1; t += step) ctx.fillText(String(t), X(t), H - 8);
  const line = (arr, color, w) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); let pen = false;
    for (let i = x0; i < x1; i++) { const v = arr[i]; if (v == null) { pen = false; continue; } const px = X(i + .5), py = Y(Math.min(1, v)); pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true; }
    ctx.stroke();
  };
  line(x.disc.ctrl, css('--muted'), 1.2); line(x.disc.ed, css('--T'), 1.6);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(X(x.cut), pt - 6); ctx.lineTo(X(x.cut), pt + ph); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = css('--ink'); ctx.textAlign = 'left'; ctx.fillText('Cut', X(x.cut) + 4, pt - 8);
  for (const a of ann || []) {
    if (a.r < x0 || a.r >= x1) continue;
    const px = X(a.r + .5); ctx.fillStyle = a.color;
    ctx.beginPath(); ctx.moveTo(px - 4, pt - 2); ctx.lineTo(px + 4, pt - 2); ctx.lineTo(px, pt + 5); ctx.closePath(); ctx.fill();
  }
}

function drawChrom(cv, tr, i0, i1, mk, ann, dim) {
  const { ctx, W, H } = prep(cv, ann && ann.length ? 184 : 150);
  const n = tr.ploc.length; i0 = Math.max(0, i0); i1 = Math.min(n - 1, i1);
  if (i1 <= i0) return;
  const bnd = k => k <= 0 ? tr.ploc[0] - 6 : k >= n ? tr.ploc[n - 1] + 6 : (tr.ploc[k - 1] + tr.ploc[k]) / 2;
  const xa = bnd(i0), xb = bnd(i1 + 1), X = p => (p - xa) / (xb - xa) * W;
  const lab = ann && ann.length ? 34 : 0, top = 24 + lab, bot = H - 16;
  let ymax = 1;
  for (const b of BASES) { const a = tr.traces[b]; for (let p = Math.floor(xa); p <= xb; p++) if (a[p] > ymax) ymax = a[p]; }
  const Y = v => bot - Math.max(0, v) / ymax * (bot - top);
  const band = ([s, e], color) => { const a = Math.max(s, i0), b = Math.min(e, i1 + 1); if (b > a) { ctx.fillStyle = color; ctx.fillRect(X(bnd(a)), 0, X(bnd(b)) - X(bnd(a)), H); } };
  band(mk.guide, css('--guide')); band(mk.pam, css('--pam'));
  const vis = (ann || []).filter(a => a.i >= i0 && a.i <= i1);
  for (const a of vis) {
    ctx.fillStyle = a.color; ctx.globalAlpha = dim ? 0.08 : 0.16;
    ctx.fillRect(X(bnd(a.i)), lab, X(bnd(Math.min(a.j, i1 + 1))) - X(bnd(a.i)), H - lab); ctx.globalAlpha = 1;
  }
  for (const b of BASES) {
    const a = tr.traces[b]; ctx.strokeStyle = css('--' + b); ctx.lineWidth = 1.3; ctx.beginPath();
    for (let p = Math.floor(xa); p <= Math.ceil(xb); p++) { const px = X(p), py = Y(a[p] || 0); p === Math.floor(xa) ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
  }
  ctx.font = `600 12px ${css('--mono')}`; ctx.textAlign = 'center';
  for (let i = i0; i <= i1; i++) { const c = tr.seq[i]; ctx.fillStyle = css('--' + c) || css('--muted'); ctx.fillText(c, X(tr.ploc[i]), lab + 15); }
  // Position ruler
  ctx.font = `10px ${css('--sans')}`; ctx.fillStyle = css('--muted');
  for (let i = i0; i <= i1; i++) {
    const rp = mk.refOf(i);
    if (rp % 10 !== 0) continue;
    ctx.fillText(String(rp), X(tr.ploc[i]), H - 4);
  }
  // Annotation labels, stacked to avoid overlap
  const used = [];
  ctx.font = `600 11px ${css('--sans')}`;
  for (const a of vis) {
    const px = a.j - a.i > 1 ? (X(bnd(a.i)) + X(bnd(Math.min(a.j, i1 + 1)))) / 2 : X(tr.ploc[a.i]); const w = Math.max(ctx.measureText(a.label).width, ctx.measureText(a.sub).width) + 8;
    let lane = 0; while (used.some(z => z.lane === lane && Math.abs(z.px - px) < (z.w + w) / 2)) lane++;
    used.push({ lane, px, w });
    const y = 10 + lane * 13;
    ctx.strokeStyle = a.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, y + 3); ctx.lineTo(px, lab); ctx.stroke();
    ctx.fillStyle = dim ? css('--muted') : a.color; ctx.textAlign = 'center'; ctx.font = `${dim ? '400' : '600'} 11px ${css('--sans')}`;
    ctx.fillText(a.label, px, y);
    if (lane === 0 && !dim) { ctx.font = `10px ${css('--sans')}`; ctx.fillStyle = css('--muted'); ctx.fillText(a.sub, px, lab - 2); }
  }
  if (mk.cut > i0 && mk.cut <= i1) {
    const cx = X(bnd(mk.cut)); ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, 20); ctx.lineTo(cx, H); ctx.stroke(); ctx.setLineDash([]);
  }
}

function donorSiteHTML(x) {
  if (!x.donorSites || !x.donorSites.length) return '';
  const rows = x.donorSites.map(d => {
    const v = d.edited == null ? null : d.edited;
    const tag = v == null ? 'not covered' : v > 0.75 ? 'present on both alleles' : v > 0.3 ? 'present on one allele' : v > 0.12 ? 'trace only' : 'absent';
    const bg = v == null ? '' : `background:rgba(${v > 0.3 ? '28,154,75' : '212,58,47'},${(0.14 + Math.abs(v - 0.5) * 0.3).toFixed(2)})`;
    return `<tr><td class="l mono">${d.from}${d.pos}${d.to}</td><td>${d.inWindow ? 'yes' : 'outside window'}</td><td style="${bg}">${v == null ? '—' : Math.round(v * 100) + '%'}</td><td>${d.control == null ? '—' : Math.round(d.control * 100) + '%'}</td><td class="l">${tag}</td></tr>`;
  }).join('');
  return `<div class="fig"><h3>Donor changes, one by one</h3>
    <p class="cap">Share of signal at each designed change that reads as the donor base. Read this before the knock-in score: that score counts only alleles carrying every change, so a donor change that never converted will drag it down.</p>
    <div class="scroll-x"><table class="comp"><thead><tr><th class="l" style="text-align:left">Change</th><th>In analysis window</th><th>Donor base in edited read</th><th>Same base in control</th><th class="l" style="text-align:left">Reading</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function distHTML(x) {
  const groups = new Map();
  for (const c of x.contribs) { const k = c.kind === 'hdr' ? 'HDR' : c.indel; groups.set(k, (groups.get(k) || 0) + c.weight); }
  const keys = [...groups.keys()].filter(k => groups.get(k) >= 0.005).sort((a, b) => (a === 'HDR') - (b === 'HDR') || a - b);
  const max = Math.max(...keys.map(k => groups.get(k)), 0.01);
  const cls = k => k === 'HDR' ? 'k-hdr' : k === 0 ? 'k-wt' : (Math.abs(k) % 3 !== 0 || Math.abs(k) >= 21) ? 'k-fs' : 'k-if';
  const lab = k => k === 'HDR' ? 'HDR' : k > 0 ? '+' + k : k < 0 ? '−' + (-k) : '0';
  return `<div class="dist" role="img" aria-label="Indel size distribution">${keys.map(k => `<div class="bc"><span class="bv">${pct(groups.get(k))}</span><div class="bar ${cls(k)}" style="height:${groups.get(k) / max * 82}%"></div></div>`).join('')}</div>
  <div class="distlab">${keys.map(k => `<span>${lab(k)}</span>`).join('')}</div>`;
}

function alleleHTML(x) {
  const list = x.contribs.filter(c => c.weight >= 0.01).slice(0, 14);
  const from = Math.max(0, x.cut - 24), to = Math.min(x.ref.length, x.cut + 26);
  const data = list.map(c => {
    const byRef = new Map(), ins = new Map();
    for (const col of specColumns(x.ref, c.spec)) {
      if (col.t === 'i') { const a = Math.ceil(col.r); if (!ins.has(a)) ins.set(a, []); ins.get(a).push(col.A); }
      else byRef.set(col.r, col);
    }
    return { byRef, ins };
  });
  const insMax = new Map(); data.forEach(d => d.ins.forEach((v, k) => insMax.set(k, Math.max(insMax.get(k) || 0, v.length))));
  const g = x.guide;
  const inG = r => r >= g.start && r < g.end, inP = r => r >= g.pamStart && r < g.pamEnd;
  const row = (fn) => {
    let h = '';
    for (let r = from; r < to; r++) {
      const slots = insMax.get(r) || 0;
      for (let s = 0; s < slots; s++) h += fn(r, s, s === 0 && r === x.cut);
      h += fn(r, -1, slots === 0 && r === x.cut);
    }
    return h;
  };
  const refRow = row((r, s, cut) => s >= 0 ? `<i class="gap${cut ? ' cut' : ''}">-</i>` : `<i class="${inG(r) ? 'g' : inP(r) ? 'p' : ''}${cut ? ' cut' : ''}">${x.ref[r]}</i>`);
  const rows = list.map((c, k) => {
    const d = data[k];
    const seq = row((r, s, cut) => {
      const cc = cut ? ' cut' : '';
      if (s >= 0) { const b = (d.ins.get(r) || [])[s]; return b ? `<i class="in${cc}">${b === 'N' ? 'n' : b}</i>` : `<i class="gap${cc}">·</i>`; }
      const col = d.byRef.get(r); if (!col) return `<i class="${cc}"> </i>`;
      return col.t === 'd' ? `<i class="d${cc}">-</i>` : col.t === 's' ? `<i class="s${cc}">${col.A}</i>` : `<i class="${cc.trim()}">${col.A}</i>`;
    });
    const at = c.kind === 'del' ? c.spec.a : c.delAt; const label = at != null ? `${c.label} at ${at + 1}` : c.label;
    return `<tr><td class="num">${pct(c.weight)}</td><td>${esc(label)}</td><td class="seqcell">${seq}</td></tr>`;
  }).join('');
  return `<table class="alleles"><thead><tr><th>Share</th><th>Allele</th><th>Sequence</th></tr></thead><tbody>
    <tr class="refrow"><td></td><td>Control</td><td class="seqcell">${refRow}</td></tr>${rows}</tbody></table>`;
}

function compHTML(x) {
  const g = x.guide, flank = 6, pl = g.pamEnd - g.pamStart;
  const lo = Math.max(0, Math.min(g.start, g.pamStart) - flank), hi = Math.min(x.ref.length, Math.max(g.end, g.pamEnd) + flank);
  const idxs = []; for (let i = lo; i < hi; i++) idxs.push(i); if (g.strand === '-') idxs.reverse();
  const flip = g.strand === '-';
  const orient = v => flip ? [v[3], v[2], v[1], v[0]] : v;
  const tint = { A: '28,154,75', C: '37,99,201', G: '38,41,44', T: '212,58,47' };
  const rows = idxs.map(i => {
    const k = i + x.offset; if (k < 0 || k >= x.edFrac.length) return '';
    const rb = flip ? (COMP[x.ref[i]] || 'N') : x.ref[i], bi = BI[rb];
    const e = orient(x.edFrac[k]); const c = x.ctrlFrac ? orient(x.ctrlFrac[i]) : null;
    let pos = '';
    if (i >= g.start && i < g.end) pos = String(g.strand === '+' ? i - g.start + 1 : g.end - i);
    else if (i >= g.pamStart && i < g.pamEnd) pos = 'PAM ' + (g.strand === '+' ? i - g.pamStart + 1 : g.pamEnd - i);
    const nonE = bi === undefined ? null : 1 - e[bi], nonC = bi === undefined || !c ? null : 1 - c[bi];
    const delta = nonE == null ? null : nonC == null ? nonE : nonE - nonC;
    const hit = delta != null && delta > 0.05;
    const cells = BASES.map((b, j) => `<td style="background:rgba(${tint[b]},${(e[j] * 0.55).toFixed(3)});${e[j] > 0.5 ? 'color:#fff' : ''}">${Math.round(e[j] * 100)}</td>`).join('');
    return `<tr class="${hit ? 'hit' : ''}"><td class="l">${pos}</td><td>${i + 1}</td><td class="mono">${rb}</td>${cells}<td>${delta == null ? '—' : (delta * 100 >= 0 ? '+' : '') + (delta * 100).toFixed(0)}</td></tr>`;
  }).join('');
  return `<table class="comp"><thead><tr><th class="l" style="text-align:left">Guide position</th><th>Read position</th><th>Ref</th><th>A %</th><th>C %</th><th>G %</th><th>T %</th><th>Non-ref vs control</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------- Export ----------
function tableRows() {
  const head = ['sample', 'control_file', 'edited_file', 'guide', 'nuclease', 'cut_after_base', 'indel_pct', 'knockout_score', 'knockin_score', 'donor_plus_indel_pct', 'wild_type_pct', 'r_squared', 'alleles', 'notes'];
  const rows = [head];
  for (const s of state.samples) {
    const r = state.results.get(s.id); if (!r) continue;
    if (!r.ok) { rows.push([s.name, r.sample.controlName || '', r.sample.editedName || '', s.guide, s.nuclease, '', '', '', '', '', '', '', '', r.error]); continue; }
    const x = r.res, f = v => v == null ? '' : (v * 100).toFixed(1);
    rows.push([s.name, r.sample.controlName, r.sample.editedName, cleanSeq(s.guide), s.nuclease, x.cut, f(x.indelPct), f(x.koScore), f(x.kiScore), f(x.partialHDR), f(x.wtPct), x.r2.toFixed(3),
      x.contribs.filter(c => c.weight >= 0.01).map(c => `${c.label.replace('−', '-')}${(c.kind === 'del' ? c.spec.a : c.delAt) != null ? '@' + ((c.kind === 'del' ? c.spec.a : c.delAt) + 1) : ''}:${(c.weight * 100).toFixed(1)}`).join('; '), x.warnings.join(' | ')]);
  }
  return rows;
}
function exportCSV() {
  const csv = tableRows().map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'peaksplit_results.csv';
  document.body.appendChild(a); a.click(); a.remove();
}
async function copyTSV() {
  const t = tableRows().map(r => r.join('\t')).join('\n');
  try { await navigator.clipboard.writeText(t); flash('#copyBtn', 'Copied'); }
  catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); flash('#copyBtn', 'Copied'); }
}
function flash(sel, txt) { const b = $(sel), o = b.textContent; b.textContent = txt; setTimeout(() => b.textContent = o, 1400); }

// ---------- Masthead trace ----------
function drawMast(progress = 1) {
  const cv = $('#mastTrace'); const { ctx, W, H } = prep(cv, 96);
  const R = mulberry(3), sp = 15, n = Math.ceil(W / sp) + 2, cutX = W * 0.46;
  const peaks = []; for (let k = 0; k < n; k++) {
    const x = k * sp + 8, main = Math.floor(R() * 4), h = 0.45 + R() * 0.5;
    peaks.push({ x, c: main, h: x < cutX ? h : h * 0.62 });
    if (x >= cutX) peaks.push({ x, c: (main + 1 + Math.floor(R() * 3)) % 4, h: (0.3 + R() * 0.35) });
  }
  const lim = W * progress;
  BASES.forEach((b, c) => {
    ctx.strokeStyle = css('--' + b); ctx.globalAlpha = 0.85; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let px = 0; px <= lim; px += 1) {
      let v = 0; for (const p of peaks) if (p.c === c && Math.abs(p.x - px) < 14) v += p.h * Math.exp(-((px - p.x) ** 2) / (2 * 3.6 * 3.6));
      const y = H - 4 - v * (H - 16); px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  if (lim > cutX) { ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--ink'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cutX, 4); ctx.lineTo(cutX, H); ctx.stroke(); ctx.setLineDash([]); }
}
function animateMast() {
  if (reduceMotion) return drawMast(1);
  const t0 = performance.now(), dur = 1400;
  const step = t => { const p = Math.min(1, (t - t0) / dur); drawMast(1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- Events ----------
function init() {
  $('#newProject').onclick = resetProject;
  $('#restoreProject').onclick = restoreProject;
  const drop = $('#drop'), input = $('#fileInput');
  $('#chooseBtn').onclick = () => input.click();
  input.onchange = () => { addFiles([...input.files]); input.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
  $('#sheetInput').onchange = async e => { const revision=projectRevision,f = e.target.files[0]; if (f) { const text=await f.text();if(revision!==projectRevision)return;importSheet(text); resolveNames(); renderSamples(); } e.target.value = ''; };
  $('#demoBtn').onclick = () => {
    resetProject();
    const d = makeDemo(); const ids = {};
    for (const t of d.files) { const id = nid(); ids[t.name] = id; state.files.set(id, { id, name: t.name, trace: t }); }
    for (const s of d.samples) state.samples.push(newSample({ name: s.name, controlId: ids[s.controlName], editedId: ids[s.editedName], guide: s.guide, nuclease: s.nuclease, donor: s.donor }));
    renderFiles(); renderSamples(); runAll();
  };
  $('#fileList').onclick = e => {
    const id = e.target.dataset.rmfile; if (!id) return;
    state.files.delete(id); state.samples.forEach(s => { if (s.controlId === id) s.controlId = ''; if (s.editedId === id) s.editedId = ''; });
    renderFiles(); renderSamples(); invalidateResults();
  };
  const sl = $('#sampleList');
  const upd = e => { const el = e.target, f = el.dataset.f, box = el.closest('[data-sid]'); if (!f || !box) return; const s = state.samples.find(z => z.id === box.dataset.sid); if (s && s[f] !== el.value) { s[f] = el.value; invalidateResults(s.id); } };
  sl.addEventListener('input', upd); sl.addEventListener('change', upd);
  sl.addEventListener('click', e => { const id = e.target.dataset.rmsample; if (!id) return; state.samples = state.samples.filter(s => s.id !== id); invalidateResults(id); renderSamples(); });
  $('#addSample').onclick = () => { state.samples.push(newSample()); renderSamples(); };
  const msg = t => { $('#bulkMsg').textContent = t; };
  $('#applyGuide').onclick = () => {
    const v = cleanSeq($('#guideAll').value); if (!v) return msg('Enter a guide sequence first.');
    state.samples.forEach(s => s.guide = v); invalidateResults(); renderSamples(); msg(`Guide applied to ${state.samples.length} sample${state.samples.length === 1 ? '' : 's'}. Reanalyze to update results.`);
  };
  $('#applyDonor').onclick = () => {
    const v = cleanSeq($('#donorAll').value);
    if (v.length < 20) return msg('Paste a donor sequence of at least 20 nt first.');
    if (!state.samples.length) return msg('Add samples first, then apply the donor.');
    state.samples.forEach(s => s.donor = v); invalidateResults(); renderSamples();
    msg(`Donor (${v.length} nt) applied to ${state.samples.length} sample${state.samples.length === 1 ? '' : 's'}. Use only the matching documented donor for each experiment. Reanalyze to update results.`);
  };
  $('#clearDonor').onclick = () => { state.samples.forEach(s => s.donor = ''); invalidateResults(); renderSamples(); msg('Donors cleared. Reanalyze to update results.'); };
  document.querySelectorAll('[data-set]').forEach(el => el.addEventListener('change', () => { const v = parseInt(el.value, 10); if (Number.isFinite(v)) state.settings[el.dataset.set] = Math.max(+el.min, Math.min(+el.max, v)); el.value = state.settings[el.dataset.set]; invalidateResults(); }));
  $('#runBtn').onclick = runAll;
  $('#exportBtn').onclick = exportCSV; $('#copyBtn').onclick = copyTSV;
  const pick = e => { const tr = e.target.closest('tr[data-sel]'); if (!tr) return; state.selected = tr.dataset.sel; renderSummary(); renderDetail(); };
  $('#summary').addEventListener('click', pick);
  $('#summary').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawMast(1); drawAll(); }, 120); });
  renderFiles(); renderSamples(); animateMast();
}
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'load-lageso-design') return;
  const design = event.data;
  document.getElementById('guideAll').value = design.guide || '';
  document.getElementById('donorAll').value = design.donor || '';
  document.getElementById('bulkMsg').textContent = `${design.label} loaded into the design fields. Apply it only to matching samples; existing sample designs have not been changed.`;
});
window.addEventListener('message', async event => {
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='load-catalog-reads')return;
 const reads=event.data.reads;if(!Array.isArray(reads)||reads.length>48)return;
 const revision=projectRevision;
 const files=[],failures=[];const status=document.getElementById('bulkMsg');
 for(const [i,item] of reads.entries()){
  status.textContent=`Loading project read ${i+1} / ${reads.length}…`;
  try{
   if(!/^\/api\/catalog\/[0-9a-f]{16}\/[0-9a-f]{24}$/.test(item.url))throw Error('Invalid catalog entry');
   const response=await fetch(item.url);if(!response.ok)throw Error((await response.json()).error||'Read unavailable');
   const blob=await response.blob();files.push(new File([blob],item.name,{type:'application/octet-stream'}));
  }catch(e){failures.push(`${item.name}: ${e.message}`);}
 }
 if(revision!==projectRevision)return;
 if(files.length){resetProject();await addFiles(files);}
 status.textContent=`Loaded ${files.length} project reads into a separate project. Choose matching controls and guides before analysis. Use Restore previous project to recover earlier data.${failures.length?' Failed: '+failures.join('; '):''}`;
});
