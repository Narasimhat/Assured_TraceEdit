// Self-contained HTML report and CSV for a batch of analysed samples.
import { WORKFLOWS, headline } from "./batch.js";

export const QC_VERSION = "0.1.0";
const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (value) => (value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`);

const STYLE = `
body{font-family:Arial,Helvetica,sans-serif;color:#101828;max-width:980px;margin:24px auto;padding:0 16px;font-size:13px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid #eaecf0;padding-bottom:4px}h3{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;margin:6px 0 12px}th,td{border:1px solid #eaecf0;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f9fafb;font-size:12px}
.muted{color:#667085}.pass{color:#067647;font-weight:700}.warn{color:#b54708;font-weight:700}.fail{color:#b42318;font-weight:700}
ul{margin:4px 0 10px 18px;padding:0}.note{background:#fffaeb;border:1px solid #fedf89;border-radius:6px;padding:8px 10px;margin:10px 0}
svg{max-width:100%;height:auto}.sample{page-break-inside:avoid}
`;

const DECISION_LABEL = { accept: "Accept", hold: "Hold", "re-sequence": "Sequence again", reject: "Reject" };
const intervalText = (iv) => (iv ? `${iv[0]}-${iv[1]}%` : "n/a");

const METHOD = [
  "Each edited trace is compared with its control. Over a window around the cut(s), the mix of bases at every position is fitted as a non-negative mixture of the alleles expected from the design (wild type, indels at each cut, deletions between cuts, the donor's complete edit, and partial conversions).",
  "Intervals are 95% intervals: the profile of the fit (what the trace cannot tell apart) widened by a margin calibrated on simulated traces built from real controls; they have not yet been calibrated on laboratory mixtures. The confidence tier is the width of the interval, not the number of warnings.",
  "Detection limit is about 5% per allele; abundances are trace-derived estimates, not allele counts. Deletions or insertions larger than the readable window, large deletions on one allele, loss of heterozygosity and copy-number changes are not visible.",
  "A clone call assumes at most two alleles. Sanger traces cannot tell a homozygous clone from one with a large deletion on the other allele.",
  "Junction reads show whether the knock-in sequence is correct and reaches genomic sequence beyond the homology arm; they cannot show zygosity or copy number.",
  "Genome-wide off-target editing is not assessed.",
];

function statusClass(r) {
  if (!r.ok) return "fail";
  if (r.kind === "junction") return r.verdict.status;
  if (r.decision) return r.decision.decision === "accept" ? "pass" : r.decision.decision === "reject" ? "fail" : "warn";
  return r.warnings && r.warnings.length ? "warn" : "pass";
}

function contributionRows(r) {
  return r.contributions.map((c) => `<tr><td>${esc(c.label)}${c.indistinguishable ? ` <span class="muted">(+${c.indistinguishable} indistinguishable on this trace)</span>` : ""}</td><td>${esc(c.kind.replace(/_/g, " "))}</td><td>${pct(c.fraction)}</td></tr>`).join("");
}

function sampleSection(workflow, r) {
  const head = `<div class="sample"><h3>${esc(r.name)}: <span class="${statusClass(r)}">${esc(headline(workflow, r))}</span></h3>`;
  if (!r.ok) return `${head}<p>${esc(r.error)}</p></div>`;
  if (r.kind === "junction") {
    const events = r.events.length ? `<table><tr><th>Difference</th><th>Region</th><th>Allele position</th><th>Detail</th><th>Quality</th></tr>${r.events.map((e) => `<tr><td>${esc(e.type)}${e.expectedChange ? " (designed change)" : ""}</td><td>${esc(e.region)}</td><td>${e.alleleIndex}</td><td>${esc(e.detail)}</td><td>${e.quality}</td></tr>`).join("")}</table>` : "<p>No differences from the expected knock-in sequence in the aligned stretch.</p>";
    const markers = r.markers.length ? `<table><tr><th>Designed change</th><th>Covered</th><th>As designed</th></tr>${r.markers.map((m) => `<tr><td>${esc(m.change)} ${esc(m.label)}</td><td>${m.covered ? "yes" : "no"}</td><td>${m.covered ? (m.present ? "yes" : `no (read shows ${esc(m.base)})`) : "n/a"}</td></tr>`).join("")}</table>` : "";
    return `${head}<ul>${r.verdict.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul><p class="muted">Read orientation ${esc(r.orientation)}; ${r.alignedBases} aligned bases at ${(r.identity * 100).toFixed(1)}% identity; 5' junction spanned: ${r.spans.fivePrimeJunction === null ? "n/a" : r.spans.fivePrimeJunction ? "yes" : "no"}; 3' junction spanned: ${r.spans.threePrimeJunction === null ? "n/a" : r.spans.threePrimeJunction ? "yes" : "no"}; genomic flank bases: ${r.spans.genomicFlankBases}.</p>${events}${markers}</div>`;
  }
  const s = r.summary;
  const numbers = `<table><tr><th>Wild type</th><th>Edited</th><th>Indels</th><th>Between cuts</th><th>Intended edit</th><th>Blocking-only</th><th>KO score</th><th>Unexplained</th></tr><tr><td>${s.wtPct}%</td><td>${s.editedPct}%</td><td>${s.indelPct}%</td><td>${s.betweenCutsPct}%</td><td>${s.intendedEditPct}%</td><td>${s.partialConversionPct}%</td><td>${s.koScorePct}%</td><td>${s.unexplainedPct ?? 0}%</td></tr></table>`;
  const decision = r.decision ? `<p><b>${esc(DECISION_LABEL[r.decision.decision] || r.decision.decision)}.</b> ${esc(r.decision.reasons.join(" "))} <span class="muted">${esc(r.decision.next)}</span></p>` : "";
  const intervals = r.intervals ? `<p>95% intervals: edited ${intervalText(r.intervals.editedPct)}, wild type ${intervalText(r.intervals.wtPct)}, intended edit ${intervalText(r.intervals.intendedEditPct)}, KO score ${intervalText(r.intervals.koScorePct)}. ${r.intervals.detected ? "" : `No edit detected; up to ${r.intervals.hiddenUpToPct}% could be present undetected. `}${r.confidence ? `Confidence <b>${esc(r.confidence.tier)}</b> (interval width ${r.confidence.width} points). <span class="muted">${esc(r.confidence.expected)}</span>` : ""}</p>` : "";
  const reads = r.reads && r.reads.length > 1 ? `<table><tr><th>Read</th><th>Orientation</th><th>Edited</th><th>Intended edit</th><th>Positions</th></tr>${r.reads.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.orientation)}</td><td>${x.editedPct}%</td><td>${x.intendedEditPct}%</td><td>${x.positions}</td></tr>`).join("")}</table><p class="muted">The reads were fitted together; ${r.agreement && r.agreement.agree ? "they agree" : "they disagree"} (spread ${r.agreement ? r.agreement.spread.toFixed(1) : "n/a"} points).</p>` : "";
  const baseEdits = r.baseEdits ? `<h3>Base editing: conversion at each position of the window</h3><table><tr><th>Protospacer position</th><th>Change</th><th>Role</th><th>Conversion</th><th>Interval</th></tr>${r.baseEdits.positions.map((p) => `<tr><td>${p.protospacerPosition}</td><td>${esc(p.change)}</td><td>${esc(p.role)}</td>${p.covered ? `<td>${p.conversionPct}%</td><td>${p.intervalPct[0]}-${p.intervalPct[1]}%</td>` : `<td colspan="2" class="muted">${esc(p.reason)}</td>`}</tr>`).join("")}</table>` : "";
  const provenance = r.inputs ? `<p class="muted">Inputs (SHA-256, first 12): ${[...r.inputs.edited.map((f) => `${esc(f.file)} ${f.sha256.slice(0, 12)}`), ...r.inputs.controls.map((f) => `control ${esc(f.file)} ${f.sha256.slice(0, 12)}`)].join("; ")}.</p>` : "";
  const genotype = r.genotype ? `<p><b>Clone call:</b> ${esc(r.genotype.summary)}.</p><ul>${r.genotype.flags.map((f) => `<li class="muted">${esc(f)}</li>`).join("")}</ul>` : "";
  const markers = r.markers.some((m) => m.covered) ? `<h3>Per-position readout of the designed changes</h3><table><tr><th>Position</th><th>Change</th><th>Role</th><th>Donor base in edited</th><th>in control</th><th>Net</th></tr>${r.markers.map((m) => `<tr><td>${m.position}</td><td>${esc(m.change)} ${esc(m.label)}</td><td>${esc(m.role)}</td>${m.covered ? `<td>${pct(m.altEdited)}</td><td>${pct(m.altControl)}</td><td>${pct(m.altNet)}</td>` : `<td colspan="3" class="muted">${esc(m.reason)}</td>`}</tr>`).join("")}</table>` : "";
  const q = r.quality;
  return `${head}${decision}${numbers}${intervals}${reads}${baseEdits}${genotype}<table><tr><th>Allele</th><th>Type</th><th>Share</th></tr>${contributionRows(r)}</table>${r.charts.contributions}${r.charts.discordance}${markers}${provenance}<p class="muted">Fit R&sup2; ${q.r2 === null ? "n/a" : q.r2} (relative to a wild-type-only fit), background signal ${pct(q.noiseFraction)}, ${q.positionsUsed} positions in the window, ${q.columns} distinguishable candidate alleles; mean discordance ${q.discordanceBefore} before the cut, ${q.discordanceAfter} after it.</p>${r.warnings.length ? `<ul>${r.warnings.map((w) => `<li class="warn">${esc(w)}</li>`).join("")}</ul>` : ""}</div>`;
}

export function buildQcReportHtml({ title = "Sanger QC report", workflow, design = "", results, generatedAt = new Date(), notes = [] }) {
  const flow = WORKFLOWS[workflow]?.label || workflow;
  const rows = results.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.decision ? esc(DECISION_LABEL[r.decision.decision]) : ""}</td><td class="${statusClass(r)}">${esc(headline(workflow, r))}</td><td>${r.ok ? (r.warnings?.length ? `${r.warnings.length} note${r.warnings.length === 1 ? "" : "s"}` : "none") : "not analysed"}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>
<h1>${esc(title)}</h1>
<p class="muted">${esc(flow)}${design ? ` &middot; ${esc(design)}` : ""} &middot; ${results.length} sample${results.length === 1 ? "" : "s"} &middot; generated ${esc(generatedAt.toISOString().slice(0, 10))} by Assured QC ${QC_VERSION}</p>
<div class="note"><b>Review required.</b> These are computed estimates from Sanger traces. Check the traces and the points flagged below before accepting a clone or releasing a line.</div>
${notes.map((n) => `<p>${esc(n)}</p>`).join("")}
<h2>Summary</h2><table><tr><th>Sample</th><th>Decision</th><th>Result</th><th>Notes</th></tr>${rows}</table>
<h2>Samples</h2>${results.map((r) => sampleSection(workflow, r)).join("")}
<h2>Method and limits</h2><ul>${METHOD.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
</body></html>`;
}

const csvCell = (value) => { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };

export function buildResultsCsv(workflow, results) {
  const header = ["sample", "well", "decision", "decision_reason", "status", "result", "wild_type_pct", "edited_pct", "edited_lo", "edited_hi", "indel_pct", "between_cuts_pct", "intended_edit_pct", "intended_lo", "intended_hi", "blocking_only_pct", "ko_score_pct", "ko_lo", "ko_hi", "unexplained_pct", "confidence", "clone_call", "reads_used", "reads_agree", "junction_verdict", "fit_r2", "unplanned_changes", "notes"];
  const lines = [header.join(",")];
  results.forEach((r) => {
    const s = r.summary || {};
    const iv = r.intervals || {};
    lines.push([r.name, r.well || "", r.decision?.decision || "", (r.decision?.reasons || []).join(" "), r.ok ? "analysed" : "failed", headline(workflow, r), s.wtPct, s.editedPct, iv.editedPct?.[0] ?? "", iv.editedPct?.[1] ?? "", s.indelPct, s.betweenCutsPct, s.intendedEditPct, iv.intendedEditPct?.[0] ?? "", iv.intendedEditPct?.[1] ?? "", s.partialConversionPct, s.koScorePct, iv.koScorePct?.[0] ?? "", iv.koScorePct?.[1] ?? "", s.unexplainedPct ?? "", r.confidence?.tier || "", r.genotype?.category || "", r.reads ? r.reads.length : (r.ok && r.kind !== "junction" ? 1 : ""), r.agreement ? r.agreement.agree : "", r.verdict?.status || "", r.quality?.r2 ?? "", (r.unplanned || []).map((h) => `${h.relative}:${h.change}(${Math.round(h.fraction * 100)}%)`).join(" "), (r.warnings || []).concat(r.ok ? [] : [r.error]).join(" | ")].map(csvCell).join(","));
  });
  return `${lines.join("\n")}\n`;
}
