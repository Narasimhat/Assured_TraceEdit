// Orchestration shared by the app, its worker and the tests: choose the design, analyse one sample, return plain data.
import { analysePair, analyseReads } from "./analyze.js";
import { specFromControl } from "./manualSpec.js";
import { validateDesignSpec } from "./designSpec.js";
import { analyseJunctionRead, classifyBands } from "./junction.js";
import { contributionsSvg, discordanceSvg } from "./charts.js";
import { baseEditMarkers, baseEditTable } from "./baseEdit.js";
import { discoverCut } from "./cutDiscovery.js";

export const WORKFLOWS = {
  knockout: { label: "Knockout (indels at one cut)", needsDonor: false, method: "trace" },
  deletion: { label: "Deletion between two or three cuts", needsDonor: false, method: "trace" },
  snp: { label: "SNP correction (ssODN, silent blocking changes)", needsDonor: true, method: "trace" },
  tag_small: { label: "Small tag knock-in (ssODN up to 300 nt)", needsDonor: true, method: "trace" },
  reporter: { label: "Large tag or reporter knock-in (junction reads)", needsDonor: false, method: "junction" },
  base_edit: { label: "Base editing (A>G or C>T in the editing window)", needsDonor: false, method: "trace", baseEdit: true },
};

/** Spec from an exported design, or built from the control trace, guides and donor. */
export function planDesign({ designSpec, control, guides, donor, gene, nuclease, baseEditor = null, editedForCut = [] }) {
  if (designSpec) {
    const check = validateDesignSpec(designSpec);
    if (!check.ok) return { error: `The design file is not usable: ${check.errors[0]}${check.errors.length > 1 ? ` (and ${check.errors.length - 1} more)` : ""}`, warnings: check.warnings };
    return { spec: designSpec, warnings: check.warnings, source: "design" };
  }
  if (!control) return { error: "Add the control trace, or a design file." };
  const guideList = (Array.isArray(guides) ? guides : String(guides || "").split(/[,\s;]+/)).filter(Boolean);
  const notes = [];
  let built;
  if (!guideList.length && !baseEditor) {
    // No guide on record: the cut is where the edited traces depart from the control.
    const found = editedForCut.map((edited) => discoverCut({ control, edited })).filter((r) => r.ok && r.confidence >= 0.3).map((r) => r.readIndex).sort((x, y) => x - y);
    if (!found.length) return { error: "No guide was given and no cut site could be inferred from the edited traces (no clear point where they depart from the control). Enter the guide sequence." };
    const cut = found[found.length >> 1];
    built = specFromControl({ control, guides: [], cutIndices: [cut], donor, gene, nuclease });
    if (!built.error) notes.push(`No guide was given: the cut was inferred at read position ${cut} (median of ${found.length} sample${found.length === 1 ? "" : "s"} that depart from the control there). Enter the guide for an exact design.`);
  } else built = specFromControl({ control, guides: guideList, donor, gene, nuclease });
  if (built.error) return { error: built.error, warnings: [] };
  if (baseEditor) {
    const reference = built.spec.reference.sequence;
    const markers = baseEditMarkers({ reference, guide: guideList[0], editor: baseEditor.editor, window: baseEditor.window, target: baseEditor.target, nuclease });
    if (markers.error) return { error: markers.error, warnings: [] };
    if (!markers.markers.length) return { error: `No ${baseEditor.editor === "CBE" ? "C" : "A"} lies in positions ${(baseEditor.window || [4, 8]).join("-")} of this protospacer, so a ${baseEditor.editor || "ABE"} would not edit it.`, warnings: [] };
    built.spec.markers = markers.markers; built.spec.design.editKind = "base_edit"; built.spec.baseEditor = { editor: baseEditor.editor || "ABE", window: baseEditor.window || [4, 8], target: baseEditor.target ?? null };
  }
  return { spec: built.spec, warnings: [...notes, ...(built.warnings || [])], source: guideList.length ? "manual" : "inferred cut" };
}

const round = (value, digits = 3) => (value === null || value === undefined || Number.isNaN(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export function analyseSample({ name, spec, control, edited, extraReads = [], sampleType = "pool", options = {} }) {
  // One read: as before. Several (forward and reverse, or repeats): fitted together; each read is aligned to its own control.
  const result = extraReads.length
    ? analyseReads({ reads: [{ name: "read 1", control, edited }, ...extraReads.map((r, i) => ({ name: r.name || `read ${i + 2}`, control: r.control, edited: r.edited }))], spec, options: { ...options, sampleType } })
    : analysePair({ control, edited, spec, options: { ...options, sampleType } });
  if (!result.ok) return { name, kind: "trace-pair", ok: false, error: result.error, warnings: result.warnings || [] };
  const decomposition = result.decomposition;
  return {
    name, kind: "trace-pair", ok: true, sampleType, warnings: result.warnings, orientation: result.prepared.orientation,
    summary: result.summary, intervals: result.intervals || null, confidence: result.confidence || null, reads: result.reads || null, agreement: result.agreement || null,
    genotype: result.genotype ? { category: result.genotype.category, call: result.genotype.call, summary: result.genotype.summary, flags: result.genotype.flags, alleles: result.genotype.alleles.map((a) => ({ label: a.label, kind: a.kind, size: a.size, fraction: round(a.fraction) })) } : null,
    contributions: decomposition.contributions.slice(0, 14).map((c) => ({ label: c.label, kind: c.kind, size: c.size, fraction: round(c.fraction, 4), indistinguishable: c.indistinguishable, alsoConsistentWith: c.alsoConsistentWith })),
    baseEdits: spec.baseEditor ? { editor: spec.baseEditor.editor, window: spec.baseEditor.window, target: spec.baseEditor.target, positions: baseEditTable(result.prepared, result.markerReadout, result.quality.upstreamRms, options.baseEdit || {}) } : null,
    unplanned: (result.unplanned || []).map((h) => ({ relative: h.relative, change: `${h.ref}>${h.alt}`, fraction: round(h.fraction, 3) })),
    markers: result.markerReadout.map((row) => ({ position: row.marker.pos, change: `${row.marker.ref}>${row.marker.alt}`, role: row.marker.role, label: row.marker.label || "", covered: row.covered, reason: row.reason || "", altEdited: round(row.altEdited), altControl: round(row.altControl), altNet: round(row.altNet) })),
    quality: { upstreamRms: round(result.quality.upstreamRms, 4), upstreamBackground: round(result.quality.upstreamBackground, 4), r2: round(decomposition.r2), noiseFraction: round(decomposition.noiseFraction), rawSum: round(decomposition.rawSum), windowLength: decomposition.windowLength, positionsUsed: decomposition.positionsUsed, candidates: decomposition.candidates, columns: decomposition.columns, discordanceBefore: round(result.quality.discordanceBefore), discordanceAfter: round(result.quality.discordanceAfter), patches: result.prepared.patches.length },
    charts: { contributions: contributionsSvg(decomposition.contributions), discordance: discordanceSvg(result.prepared) },
  };
}

export function analyseJunction({ name, spec, trace, donorName }) {
  const result = analyseJunctionRead({ trace, spec, donorName });
  if (!result.ok) return { name, kind: "junction", ok: false, error: result.error, looksWildType: Boolean(result.looksWildType), warnings: [] };
  return {
    name, kind: "junction", ok: true, orientation: result.orientation, identity: round(result.identity, 4), alignedBases: result.alignedBases,
    verdict: result.verdict, spans: result.spans, wildTypeIdentity: round(result.wildTypeIdentity, 4),
    events: result.events.slice(0, 20).map((e) => ({ type: e.type, region: e.region, alleleIndex: e.alleleIndex, quality: e.quality, detail: e.type === "mismatch" ? `${e.expected}>${e.read}` : e.type === "deletion" ? `${e.length} bp` : e.bases || "", expectedChange: Boolean(e.expectedChange) })),
    markers: result.markers.map((m) => ({ position: m.marker.pos, change: `${m.marker.ref}>${m.marker.alt}`, label: m.marker.label || "", covered: m.covered, present: Boolean(m.present), base: m.base || "" })),
    warnings: [],
  };
}

/** One-line result for the sample table. */
export function headline(workflow, r) {
  if (!r.ok) return r.error;
  if (r.kind === "junction") return `${r.verdict.summary}${r.spans.fivePrimeJunction === false ? "; 5' junction not spanned" : ""}${r.spans.threePrimeJunction === false ? "; 3' junction not spanned" : ""}`;
  const s = r.summary;
  if (r.genotype) return r.genotype.summary;
  if (workflow === "snp" || workflow === "tag_small") return `Intended edit ${s.intendedEditPct}%, blocking-only ${s.partialConversionPct}%, indels ${s.indelPct}%, wild type ${s.wtPct}%`;
  if (workflow === "deletion") return `Edited ${s.editedPct}% (deletion between cuts ${s.betweenCutsPct}%), KO score ${s.koScorePct}%`;
  return `Edited ${s.editedPct}%, KO score ${s.koScorePct}%, wild type ${s.wtPct}%`;
}

export function bandsFor(spec, observed, donorName) {
  const amplicon = (spec.amplicons || [])[0];
  if (!amplicon) return null;
  const edited = donorName && amplicon.editedBp[donorName] ? { [donorName]: amplicon.editedBp[donorName] } : amplicon.editedBp;
  return classifyBands(observed, { ...amplicon, editedBp: edited });
}
