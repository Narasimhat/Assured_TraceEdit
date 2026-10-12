# Assured QC 0.3.0 in combined analysis

Workspace 1.4.0 vendors upstream e691ca3b28a73196296c8e3dfee91bee869d99df without engine modifications. The provenance manifest records normalized source hashes.

The selected GenBank reference and transcript now reach the QC worker. Functional loss-of-function and uncertain contributions are retained alongside confidence and intervals. The result card uses the functional estimate when available; without coding context it retains the explicitly labeled length proxy. TraceEdit predictions remain separate.

QC uses the upstream 25-base pre-cut and 150-base post-cut defaults. The substitution workflow expands the window only to include donor markers; those settings are exported. Comparisons require identical files, guide/donor selection, intended markers, transcript and settings.

Validation: 47 application tests passed. The combined worker and upstream standalone orchestration were compared on MYD88 clones 1, 3 and 6 with the same WT, HTML design and GenBank. Summary scores and rounded genotype allele contributions matched. HTML parsing and prepared specifications matched. This is integration regression evidence, not independent biological validation. Clone 3 still requires review against TraceEdit's alignment failure. Existing private input files and reports are not included in this release.
