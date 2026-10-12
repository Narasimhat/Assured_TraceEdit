# Assured Analysis

Open https://assured-traceedit.vercel.app/unified.html. The root URL also opens this workspace. The standalone TraceEdit interface remains at `/index.html`. The header identifies Local/Online and the running build; Local projects opens the existing catalog without changing its files.

1. Enter or save a project setup, or import an Assured HTML report and choose guides and one or both donors. HTML files stay in the browser. Saved setups contain selected design fields, not AB1 data.
2. Add AB1 files repeatedly from different folders. Byte-identical duplicates are skipped; distinct files with identical names retain unique import numbers. Assign control, sample or ignored roles, and review each sample's matching control.
3. Review setup. For a substitution donor, both engines must map the same substitutions to each control. Select every intended nucleotide change separately for each control and confirm the design and pairings. Review sends the control and donor to TraceEdit; the processing notice appears before the Review button.
4. Run both. AssuredQC runs in a browser worker; TraceEdit uses its existing same-origin server API. Each read is fitted independently, even if several reads came from one clone. A failed engine remains visible without discarding the other result.
5. Inspect the comparison, warnings, donor-site signals, model contributions and continuous traces. Export a combined HTML report, CSV and full JSON. TraceEdit trace windows and AssuredQC figures can also be downloaded as SVG.

## Shared scope

Version 1.1 supports one/two SpCas9 guides, knockouts/deletions, and one or two substitution donors of 30–300 nt each with up to six distinct changes. Large inserts, other nucleases, unknown-guide inference and joint forward/reverse fitting remain in the separate apps.

Engine candidate models and defaults remain distinct. AssuredQC's adapter expands its window to include donor changes, bounded at 150 bases upstream and 250 downstream. Actual settings and fit coverage are recorded. The adapter requests 40 bases upstream and 150 downstream for AssuredQC (expanding for distant markers), and a 150-base TraceEdit window. TraceEdit retains its native window rules. Both receive identical control/sample bytes and reviewed guides/substitutions; input hashes are checked before comparison.

## Interpretation

No averaged score or confirmed genotype is produced. Review flags include raw target-signal or indel differences over 15 percentage points, source-hash mismatch, missing target coverage, fit R² below 0.85, engine warnings, or indels above 10% in a SNP screen. These are transparent review heuristics, not validated biological cutoffs. Corrected SNP signals are displayed separately because the correction formulae differ. Agreement between tools does not independently validate the experiment.

## Reproducibility and privacy

`public/unified/vendor/assured-qc/provenance.json` pins the upstream source commit and per-file hashes. Copied AssuredQC engine modules are unmodified. TraceEdit health metadata includes the engine-file SHA-256; exported JSON records both engine identities.

No project inventory or experimental reads are included in the feature. Files and results stay in this tab until exported; TraceEdit processing transmits selected AB1 bytes to the server. Saved setups use browser local storage and are origin-specific. Changing files/setup invalidates review and labels old results as a previous run. Loading a different project clears reads after confirmation. Download results before closing the tab.

## Verification

- `node --test tests/*.test.cjs` includes importer, review, comparison, CSV-injection and report-escaping checks.
- Existing Python engine/API tests remain applicable; the inference engine was not modified.
- Browser checks cover additive file selections, synthetic 55% SNP recovery by both engines, upstream-window inclusion, JSON/HTML exports and mobile layout.
- Real CDON knockout and NALCN V316M control/sample pairs were checked locally. No experimental data were sent to the hosted deployment for these tests.

## Pool reports

Two manual donors are separated with a blank line; wrapped lines within a donor remain accepted. Each donor retains its own marker membership. Conflicting alternate alleles at one position are rejected. Multiple intended bases are selected explicitly during review. HTML reports include a summary, per-base raw/corrected signals, all target highlights, continuous traces, fit warnings, provenance and interpretation limits. Full-donor contributions are not reported as precise-edit efficiency. No automatic ICE comparison is fabricated; external ICE results are not imported.

PHF6 S199E and S199A were verified end-to-end on localhost with both guides and donors; experimental inputs are excluded from Git.

## Import and individual reports (1.2)

Selecting an HTML design fills project and inferred gene metadata immediately when no reads are loaded. Applying the selected design fills the reviewed guide/donor choices. Gene and sequencing primer are optional labels; PCR primer sequences are not assumed to identify the actual sequencing primer. Explicit matching control/sample review remains required. Each result shows native engine contributions automatically and offers separate AssuredQC and TraceEdit HTML reports, both per read and for all completed reads. These exports contain each engine’s own output from the shared reviewed settings; they are not standalone-default reruns.

## HTML mutation annotations

The unified importer reads a unique `Codon: REF -> ALT` annotation and synonymous `p.X123X: REF -> ALT` codon changes within the selected design section. It maps both orientations against the WT and requires all differing bases to match donor substitutions. Only unique, non-conflicting intended mappings are preselected. Silent matches are labeled in review. Missing, ambiguous or unsupported annotations fall back to manual selection; Select all is never automatic. Stored setup provenance retains the parsed annotations.

## Estimated HDR

HDR cards aggregate the existing engines' best-fit outcomes, not ICE/DECODR outputs. Complete donor-compatible contributions contain every mapped substitution of at least one donor (including blocking changes), with no net length change. Each outcome is counted once even when matching multiple donors. Partial donor-pattern contributions contain mapped donor changes without a complete donor signature. AQ uses carried marker coordinates; TE uses validated substitution proposal identifiers. Other models and fitting settings remain unchanged.

Multisite and multiple-donor results are provisional. Low R² produces a visible weak-fit warning, not automatic suppression of the number. Equivalent candidates are flagged. No alternative-mixture optimization or confidence intervals have been implemented; the estimate does not establish a unique molecular composition or repair pathway. Missing mappings, coverage or unsupported outcome identifiers remain unresolved. Native TraceEdit PDF retains standalone output. UI, combined HTML, AssuredQC HTML, CSV and JSON include these estimates. Re-run older sessions to record donor mappings.

## Possible knockout screening (1.3)

A unique GenBank filename in the selected design HTML is resolved from the local catalog automatically. Identical file copies are deduplicated by SHA-256; distinct contents with the same name require selection. No arbitrary file paths or URLs are accepted. This local resolver is absent on Vercel: a filename alone does not provide the file to the online app. The reference is not silently replaced with a public transcript.

The optional coding-aware prediction uses a complete, standard-code CDS in that reference. Multiple CDS features require an explicit transcript/protein identifier. Control reads need a unique mapping supported by separated Q20 anchors, plus exact reference agreement across the edit and flanks. Both strands are handled. Ambiguous outcome classes, incompatible references and unsupported edits stay unresolved.

Possible KO contribution is the sum of native TraceEdit model weights for internal-CDS frameshifts with a reconstructed premature stop, plus canonical coding-exon splice-site disruptions. This is not an allele frequency, functional-KO probability or calibrated success rate. Splice disruptions are reported separately; their RNA consequence and NMD status remain unresolved. In-frame effects are not automatically classified as loss of function. Only one selected transcript is assessed; other isoforms and allele dropout remain possible.

NMD predictions use the matching mRNA exon annotation, or consistently labelled non-overlapping exons from a single-CDS reference export. The rules flag start-proximal stops, terminal-junction proximity and long exons as possible escape; missing exon annotation stays unknown. See Lindeboom et al. ([2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5045715/); [2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6858879/)). These rules do not measure NMD or eliminate escape mechanisms.

Western blot priority is an unvalidated triage rule: at least 80% possible-KO contribution, at most 10% unresolved model contribution, both engine fits at least 0.95, native Q20 fractions at least 0.70, upstream mismatch at most 0.08, matching input hashes, and out-of-frame contributions within 15 percentage points. Unresolved warnings block prioritization. Scores are not averaged between engines: the coding prediction annotates TraceEdit outcomes; AssuredQC provides a consistency check. Bulk pools never receive a clone-selection recommendation.

The screen, combined HTML report, CSV and JSON include these predictions. Standalone/native engine reports retain their original outputs. Original experiments and reference files remain excluded from Git and deployment uploads.
