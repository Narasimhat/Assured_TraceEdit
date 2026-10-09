# Assured Analysis

Open https://assured-traceedit.vercel.app/unified.html. The existing TraceEdit interface remains at the root URL.

1. Enter or save a project setup, or import an Assured HTML report and choose guides and a donor. HTML files stay in the browser. Saved setups contain selected design fields, not AB1 data.
2. Add AB1 files repeatedly from different folders. Byte-identical duplicates are skipped; distinct files with identical names retain unique import numbers. Assign control, sample or ignored roles, and review each sample's matching control.
3. Review setup. For a substitution donor, both engines must map the same substitutions to each control. Select the intended SNP separately for each control and confirm the design and pairings. Review sends the control and donor to TraceEdit; the processing notice appears before the Review button.
4. Run both. AssuredQC runs in a browser worker; TraceEdit uses its existing same-origin server API. Each read is fitted independently, even if several reads came from one clone. A failed engine remains visible without discarding the other result.
5. Inspect the comparison, warnings, donor-site signals, model contributions and continuous traces. Export a combined HTML report, CSV and full JSON. TraceEdit trace windows and AssuredQC figures can also be downloaded as SVG.

## Shared scope

Version 1 supports one/two SpCas9 guides, knockouts/deletions, and substitution donors of 30–300 nt with up to six changes. Large inserts, other nucleases, unknown-guide inference and joint forward/reverse fitting remain in the separate apps.

Engine candidate models and defaults remain distinct. AssuredQC's adapter expands its window to include donor changes, bounded at 150 bases upstream and 250 downstream. Actual settings and fit coverage are recorded. TraceEdit retains its native window rules. Both receive identical control/sample bytes and reviewed guides/substitutions; input hashes are checked before comparison.

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
