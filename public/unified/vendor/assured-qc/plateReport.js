// One-page plate view of the decisions: which wells to keep, hold, sequence again or discard. Wells come from the file names (A01 ... H12) or a sheet column;
// without them the samples are listed in order. Self-contained HTML, no scripts.
import { DECISION_ORDER, tally } from "./decision.js";
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COLOR = { accept: "#d1fadf", hold: "#fef0c7", "re-sequence": "#d1e9ff", reject: "#fee4e2" };
const BORDER = { accept: "#12b76a", hold: "#f79009", "re-sequence": "#2e90fa", reject: "#f04438" };
const SHORT = { accept: "A", hold: "H", "re-sequence": "S", reject: "R" };

export function buildPlateReportHtml({ title = "Plate", results, generatedAt = new Date() }) {
  const decisions = results.map((r) => r.decision); const counts = tally(decisions);
  const located = results.filter((r) => r.well); const byWell = new Map(); located.forEach((r) => { if (!byWell.has(r.well)) byWell.set(r.well, r); });
  const rows = "ABCDEFGH".split(""); const cols = Array.from({ length: 12 }, (_, i) => i + 1);
  const cell = (r) => `<td title="${esc(`${r.name}: ${r.decision.decision}. ${r.decision.reasons.join(" ")} ${r.decision.next}`)}" style="background:${COLOR[r.decision.decision]};border:2px solid ${BORDER[r.decision.decision]}"><b>${SHORT[r.decision.decision]}</b><br><span>${esc(String(r.name).slice(0, 12))}</span></td>`;
  const grid = byWell.size ? `<table class="plate"><tr><th></th>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${rows.map((row) => `<tr><th>${row}</th>${cols.map((c) => { const r = byWell.get(`${row}${c}`); return r ? cell(r) : "<td class=\"empty\"></td>"; }).join("")}</tr>`).join("")}</table>` : "";
  const list = (kind) => results.filter((r) => r.decision.decision === kind);
  const section = (kind, heading) => list(kind).length ? `<h3>${heading} (${list(kind).length})</h3><table><tr><th>Sample</th><th>Well</th><th>Why</th><th>Next step</th></tr>${list(kind).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.well || "")}</td><td>${esc(r.decision.reasons.join(" "))}</td><td>${esc(r.decision.next)}</td></tr>`).join("")}</table>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} plate report</title><style>
body{font-family:Arial,Helvetica,sans-serif;color:#101828;max-width:1100px;margin:24px auto;padding:0 16px;font-size:13px}h1{font-size:20px}h3{font-size:14px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #eaecf0;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f9fafb}
.plate td{width:7.5%;height:46px;text-align:center;font-size:11px;padding:2px}.plate td span{color:#475467;font-size:9px}.plate td.empty{background:#fafafa;border:1px solid #eaecf0}.legend span{display:inline-block;margin-right:14px;padding:2px 8px;border-radius:4px}
</style></head><body><h1>${esc(title)}: plate decisions</h1>
<p class="legend"><span style="background:${COLOR.accept}">A accept ${counts.accept}</span><span style="background:${COLOR.hold}">H hold ${counts.hold}</span><span style="background:${COLOR["re-sequence"]}">S re-sequence ${counts["re-sequence"]}</span><span style="background:${COLOR.reject}">R reject ${counts.reject}</span> &middot; ${results.length} samples &middot; generated ${esc(generatedAt.toISOString().slice(0, 10))}</p>
${grid}${DECISION_ORDER.map((k) => section(k, { accept: "Accept", hold: "Hold", "re-sequence": "Sequence again", reject: "Reject" }[k])).join("")}
<p class="muted">Decisions follow the thresholds in run.json and the reasons listed; they are computed from Sanger traces and need review before a clone is released.</p></body></html>`;
}

export function resequenceListCsv(results) {
  return `sample,well,reason\n${results.filter((r) => r.decision.decision === "re-sequence").map((r) => [r.name, r.well || "", r.decision.reasons.join(" ")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")}\n`;
}
