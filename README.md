# ASSURED TraceEdit + Peaksplit

An independent Sanger sequencing analysis app for bulk samples and clone screening, with specified SNP signals, bounded indel mixture fitting, continuous chromatograms, and publication figure exports.

The app supports local execution and stateless hosted analysis. Experimental inventories, traces, extracted workbooks, sample sheets and generated reports are excluded from Git and deployment uploads.

## Unified workflow

The main workspace guides users through **Edit → Reads → Results**. Optional donors, advanced settings, raw cut-site traces and figure exports are collapsed. Peaksplit and supporting tools are available under More. The local project catalog and evidence-audit tools require a locally generated inventory; they are not included in the hosted app.

Deletion review groups sequence-identical proposals, shows missing segments and predicted junctions, and retains breakpoint ambiguity. Peaksplit offers a reversible project reset and requires explicit control pairing.

## Run locally

Python 3.11 or newer:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:8767. TraceEdit sends requests only to this local server; Peaksplit analyzes files in the browser.

## Deploy on Vercel

Import this repository into Vercel, use the repository root, and select the Flask framework if it is not detected automatically. No custom build command is needed. `app.py` exposes the Flask application; `public/` supplies static assets. The included `vercel.json` sets the function duration and response security headers. Subsequent pushes to the production branch can deploy through the Vercel Git integration.

## Workflow

1. Select a matching wild-type AB1 and one or more sample AB1 files.
   Optionally upload an **Assured Design HTML report** to populate gRNAs (without PAM) and ssODNs. HTML is parsed locally in a detached, inert template and is never displayed or sent to the server. If multiple designs or donors are present, select the intended option. Import reads the gRNA and donor sections, excluding primers, wild-type rows, and historical records. Import clears prior cut/SNP coordinates to avoid carrying them into a new design.
2. Enter one or two SpCas9 protospacers without PAM, or explicit cut-after positions in the control read.
3. Paste an ssODN into the optional donor field, or use the imported donor. Either DNA strand is supported; whitespace is ignored. **Analyze automatically maps a nonempty donor to the control first**, filling its SNPs; the separate Map button lets you review them before analysis. Mapping failures stop analysis. Alternatively enter substitutions such as `C247T`. Coordinates are 1-based **control-read positions**, not genome coordinates or protein residue numbers. The current model supports substitution donors, not donor insertions/deletions.
4. Analyze. Each sample is a separate stateless request. Inspect QC warnings, alternate-channel signals, and continuous traces.
5. Download JSON/CSV. Select up to 12 successful samples for PDF/SVG/600-dpi PNG figures and an all-sample PDF report. A provenance manifest records source hashes, window scaling, and selection.

Clone/bulk context is recorded as metadata; both use the same inference model. The application deliberately does not automatically classify genotypes or positive clones.

## Signal processing and limits

- Biopython reads ABIF base calls, quality, analyzed dye channels DATA9–12, dye order FWO_1, and PLOC2 (PLOC1 fallback).
- Mixture inference uses normalized four-channel signals integrated over three scans around each called peak. An upstream alignment chooses read orientation and a constant base offset.
- Nonnegative least squares fits bounded deletion/insertion proposals, dual-cut excision, and combinations of up to six specified substitutions. Default bounds are deletion 20 bp, insertion 2 bp, and downstream window 120 bases.
- The continuous display uses all analyzed instrument scans within the chosen window, mapped to fractional control-read positions by called peaks. It applies one shared maximum-absolute amplitude divisor per window. It does not smooth, remove secondary peaks, subtract a baseline, or normalize each base independently.
- Per-site SNP percentages are background-corrected channel signals, **not calibrated allele/cell fractions**. Separate SNPs cannot be phased from these mixtures. High R² does not establish biological validity, and a frameshift proxy does not establish functional knockout.
- Complex indels, base-calling gaps, low-quality reads, mismatched controls, unequal dye responses, and variants outside the bounded proposal set may produce misleading fits. Downstream constant-offset displays can be unreliable across indels. Inspect raw evidence and confirm findings independently.
- This is a research prototype, not a validated assay and not an implementation or endorsed replacement of Synthego ICE or DECODR. Synthetic tests verify implementation behavior; they do not establish biological accuracy.

## Cloud data handling

The hosted app transmits the selected control and one sample to the server over HTTPS per analysis request. No account, database, server-side run history, or shared upload directory is implemented. Uploaded AB1 bytes are processed in request memory. Export files use request-scoped temporary directories and are removed after the response bytes are prepared. The application does not log sequencing payloads. Hosting infrastructure may retain operational metadata/logs; this is not a promise of infrastructure-level zero retention.

Results live in the current browser tab until exported. Reloading or closing can lose the session. Download analysis JSON to retain and re-import it. Export rendering trusts the browser-held session; source hashes provide provenance but do not independently authenticate an imported/modified JSON session.

Each AB1 is limited to 2 MB, requests and generated files to 4 MB, and batches to 384 reads. Select fewer rows if a figure exceeds cloud limits. Cloud servers cannot access local disks or institutional network drives; select files with the browser picker. Use local execution when files must remain on your computer.

The public repository contains application code and synthetic tests only. Never commit experimental reads, reports, private project documents, credentials, or patient information. `.gitignore` is an additional safeguard, not a substitute for reviewing staged files.

## Local project folder catalog

Open `/catalog.html` to browse the U: project tree by year, folder, file category, and filename. The catalog records original paths and first-level ZIP members. Files remain on U:; selecting up to 48 AB1 reads loads them into Peaksplit through the local server. Review sample/control assignments before analysis.

Refresh the inventory from this app directory with `python scripts/index_project_folders.py`. The source root is configured at the top of that script. Generated inventories are stored in `public/catalog/` and excluded from Git. Keep this experimental-data app local; the catalog contains private project paths.

The inventory is a file listing, not content extraction or completed analysis. Duplicate copies are counted separately. Nested and non-ZIP archives are listed but not expanded; unreadable archives appear under coverage issues. Years come from folder names, and unlabelled folders remain Unspecified.

## Verification

### Corpus audit, historical evidence and batch analysis

The local `/corpus.html` workspace shows quality screens, exact duplicate counts, guide candidates, evidence extraction, historical comparisons and batch execution. It does not claim validated genotypes or a trained model. Keep generated corpus files local.

Install optional audit dependencies with `python -m pip install -r requirements-audit.txt`. From the app root run:

```powershell
python corpus.py
python scripts/collect_evidence.py
python scripts/retrospective_decodr.py
python scripts/benchmark_engine.py
python scripts/build_review_manifest.py
python scripts/development_report.py
```

The trace scan checkpoints completed source files by path/size/mtime and caches QC by SHA-256. Re-run it after refreshing the catalog. Documents are cached by content hash. Nested AB1 ZIPs are expanded with byte/depth limits; document extraction currently covers physical files and first-level ZIP members. Images, PDF figures, legacy binary files and nested documents require separate review. No source files are edited.

The label-review JSON leaves outcomes blank. Connected projects sharing read copies, called sequences or guides are grouped before future splitting. A reviewer still needs to verify outcomes, evidence quality, controls, primers, clone relationships and independent test groups. ICE/DECODR results remain comparators.

For resumable native analysis, upload a JSON manifest at `/corpus.html` or run `python batch.py path-to-manifest.json`. A manifest has a `jobs` array with these fields per job:

```json
{
  "id": "unique-sample-name",
  "sample_sha256": "sample hash from the corpus",
  "control_sha256": "control hash from the corpus",
  "pairing_reviewed": true,
  "settings": { "guides": ["documented SpCas9 protospacer"] }
}
```

Only set `pairing_reviewed` after review. Alternatively, the historical importer records `pairing_evidence` with kind `saved_tool_export` and the exact source path documenting both samples. Optional `donor` supports the native substitution-donor mapping; large insertion donors remain unsupported. `negative_control_check: true` is required for identical control/sample hashes. The batch supports up to 2,000 jobs, executes one at a time, caches completed fits by input hashes/settings/engine source, and retries failed jobs. Cancellation happens after the current sample. The current batch report is replaced by the next batch; SQLite retains successful fit caches. Export reports you need to keep.

The app's interactive TraceEdit endpoints remain request-scoped; the corpus and batch workflow use persistent local SQLite files under `data/`. Run on loopback only. The upstream cloud-deployment instructions below do not provision this network-drive workflow.

The DECODR retrospective importer uses explicit sample/control names only when they each resolve to one byte hash; ambiguous names and HDR cases stay in a review queue. Generic historical `Cas9` labels are interpreted as SpCas9. Differences from historical tool outputs are not accuracy estimates.

```sh
python -m pip install pytest
python -m pytest -q
python synthetic.py
```

The synthetic generator writes a control and a 55% alternate-signal mixture into ignored `tmp/synthetic/`, plus analysis settings. No experimental data is distributed. Tests cover orientation, offset handling, simple indel/SNP mixtures, donor mapping, ABIF upload, continuous windows, stateless exports, and invalid input.

Frontend importer/workflow regression tests use `pnpm install` followed by `pnpm test` (Node.js). These check annotated report parsing, separate donor/design choices, PAM/primer exclusion, inert HTML handling, automatic donor mapping, and mapping failure behavior.
