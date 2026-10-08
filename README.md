# Assured TraceEdit

An independent Sanger sequencing analysis app for bulk samples and clone screening, with specified SNP signals, bounded indel mixture fitting, continuous chromatograms, and publication figure exports.

**Live app:** https://assured-traceedit.vercel.app/

## Run locally

Python 3.12 recommended:

```sh
python -m venv .venv
# Activate the environment using your platform's standard command.
python -m pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:8767. Local execution processes uploads on your computer.

## Deploy on Vercel

Import this repository into Vercel, use the repository root, and select the Flask framework if it is not detected automatically. No custom build command is needed. `app.py` exposes the Flask application; `public/` supplies static assets. The included `vercel.json` sets the function duration and response security headers. Subsequent pushes to the production branch can deploy through the Vercel Git integration.

## Workflow

1. Select a matching wild-type AB1 and one or more sample AB1 files.
   Optionally upload an **Assured Design HTML report** to populate gRNAs (without PAM) and ssODNs. HTML is parsed locally in a detached, inert template and is never displayed or sent to the server. If multiple designs or donors are present, select the intended option. Import reads the gRNA and donor sections, excluding primers, wild-type rows, and historical records. Import clears prior cut/SNP coordinates to avoid carrying them into a new design.
2. Enter one or two SpCas9 protospacers without PAM, or explicit cut-after positions in the control read.
3. Paste an ssODN into the always-visible donor field, or use the imported donor. Either DNA strand is supported; whitespace is ignored. **Analyze automatically maps a nonempty donor to the control first**, filling its SNPs; the separate Map button lets you review them before analysis. Mapping failures stop analysis. Alternatively enter substitutions such as `C247T`. Coordinates are 1-based **control-read positions**, not genome coordinates or protein residue numbers. The current model supports substitution donors, not donor insertions/deletions.
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

## Verification

```sh
python -m pip install pytest
python -m pytest -q
python synthetic.py
```

The synthetic generator writes a control and a 55% alternate-signal mixture into ignored `tmp/synthetic/`, plus analysis settings. No experimental data is distributed. Tests cover orientation, offset handling, simple indel/SNP mixtures, donor mapping, ABIF upload, continuous windows, stateless exports, and invalid input.

Frontend importer/workflow regression tests use `pnpm install` followed by `pnpm test` (Node.js). These check annotated report parsing, separate donor/design choices, PAM/primer exclusion, inert HTML handling, automatic donor mapping, and mapping failure behavior.
