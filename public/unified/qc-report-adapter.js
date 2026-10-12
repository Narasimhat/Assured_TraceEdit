// Serialization follows upstream batch.analyseSample; the pair is fitted only once.
import {contributionsSvg,discordanceSvg} from './vendor/assured-qc/charts.js';
import {baseEditTable} from './vendor/assured-qc/baseEdit.js';
const round = (value, digits = 3) => (value === null || value === undefined || Number.isNaN(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

const compactFunction = (fn) => ({ call: fn.call, score: { lofPct: fn.score.lofPct, uncertainPct: fn.score.uncertainPct, notLofPct: fn.score.notLofPct }, caveats: fn.caveats, confirm: fn.confirm, context: fn.context,
  rows: fn.rows.map((r) => ({ label: r.label, kind: r.kind, size: r.size, fraction: round(r.fraction, 4), class: r.class, lof: r.lof, summary: r.summary, details: r.details })) });

export function packQcResult(result,name,spec,sampleType,options={}){
  const decomposition = result.decomposition;
  return {
    name, kind: "trace-pair", ok: true, sampleType, warnings: result.warnings, orientation: result.prepared.orientation,
    summary: result.summary, intervals: result.intervals || null, confidence: result.confidence || null, reads: result.reads || null, agreement: result.agreement || null,
    genotype: result.genotype ? { category: result.genotype.category, call: result.genotype.call, summary: result.genotype.summary, flags: result.genotype.flags, alleles: result.genotype.alleles.map((a) => ({ label: a.label, kind: a.kind, size: a.size, fraction: round(a.fraction) })) } : null,
    contributions: decomposition.contributions.slice(0, 14).map((c) => ({ label: c.label, kind: c.kind, size: c.size, fraction: round(c.fraction, 4), indistinguishable: c.indistinguishable, alsoConsistentWith: c.alsoConsistentWith })),
    functional: result.functional ? compactFunction(result.functional) : null,
    baseEdits: spec.baseEditor ? { editor: spec.baseEditor.editor, window: spec.baseEditor.window, target: spec.baseEditor.target, positions: baseEditTable(result.prepared, result.markerReadout, result.quality.upstreamRms, options.baseEdit || {}) } : null,
    unplanned: (result.unplanned || []).map((h) => ({ relative: h.relative, change: `${h.ref}>${h.alt}`, fraction: round(h.fraction, 3) })),
    markers: result.markerReadout.map((row) => ({ position: row.marker.pos, change: `${row.marker.ref}>${row.marker.alt}`, role: row.marker.role, label: row.marker.label || "", covered: row.covered, reason: row.reason || "", altEdited: round(row.altEdited), altControl: round(row.altControl), altNet: round(row.altNet) })),
    quality: { upstreamRms: round(result.quality.upstreamRms, 4), upstreamBackground: round(result.quality.upstreamBackground, 4), r2: round(decomposition.r2), noiseFraction: round(decomposition.noiseFraction), rawSum: round(decomposition.rawSum), windowLength: decomposition.windowLength, positionsUsed: decomposition.positionsUsed, candidates: decomposition.candidates, columns: decomposition.columns, discordanceBefore: round(result.quality.discordanceBefore), discordanceNearCut: round(result.quality.discordanceNearCut), discordanceAfter: round(result.quality.discordanceAfter), patches: result.prepared.patches.length },
    charts: { contributions: contributionsSvg(decomposition.contributions), discordance: discordanceSvg(result.prepared) },
  };
}
