export const VERSION = '1.0.0';
export const dna = value => String(value || '').replace(/\s+/g, '').toUpperCase();
export const variantKey = v => `${v.ref}${v.position}${v.alt}`;
export const percent = v => Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
export function validateSetup(s) {
  if (!s.name.trim() || !s.gene.trim() || !s.primer.trim()) throw Error('Enter a project name, gene and sequencing primer.');
  if (!s.guides.length || s.guides.length > 2 || s.guides.some(g => !/^[ACGT]{20}$/.test(g))) throw Error('Enter one or two 20-base SpCas9 guides without PAM.');
  if (s.donor && (!/^[ACGT]{30,300}$/.test(s.donor))) throw Error('Use a substitution donor of 30–300 A/C/G/T bases. Larger inserts require the separate apps.');
  if (s.workflow === 'snp' && !s.donor) throw Error('Add the substitution donor for SNP screening.');
  if (s.workflow === 'knockout' && s.donor) throw Error('Choose SNP screening to use a donor, or clear the donor for knockout analysis.');
}
export function compare(row) {
  const a = row.aq, t = row.te, target = row.target;
  if (!a?.ok || !t?.metrics) return {label:'Incomplete', reasons:['One or both engines failed. Inspect the individual error; no combined conclusion is available.']};
  const reasons = [];
  if (![a.summary?.indelPct,t.metrics.indel_fraction,a.r2,t.metrics.r_squared].every(Number.isFinite)) return {label:'Incomplete',reasons:['An engine did not return finite fit and indel measurements.']};
  if (a.controlHash !== t.source_hashes?.control || a.sampleHash !== t.source_hashes?.sample) return {label:'Input mismatch', reasons:['Engine input hashes differ. These results must not be compared.']};
  const ai=a.summary.indelPct/100, ti=t.metrics.indel_fraction;
  const am=target && a.markers.find(v=>variantKey(v)===variantKey(target));
  const tm=target && t.variants.find(v=>variantKey(v)===variantKey(target));
  const targetComparable=!target || (am?.covered && am.inFit && Number.isFinite(am.raw) && Number.isFinite(tm?.sample_alt_signal));
  const difference=Math.abs(ai-ti)>.15 || (targetComparable && target && Math.abs(am.raw-tm.sample_alt_signal)>.15);
  if (difference) reasons.push('Engine estimates differ by more than 15 percentage points (a review threshold, not a validated biological cutoff).');
  if (!targetComparable) reasons.push('The intended SNP is missing, outside the fitted window, or not covered by both engines.');
  if (a.r2<.85 || t.metrics.r_squared<.85) reasons.push('At least one fit has R² below 0.85.');
  if (target && Math.max(ai,ti)>.1) reasons.push('Indels may confound position-by-position SNP signal.');
  if (a.warnings?.length || t.warnings?.length || t.display_errors?.length) reasons.push('One or both engines report warnings; inspect the traces.');
  if (a.markers.some(v=>!v.inFit)) reasons.push('A donor change is outside the AssuredQC fit window.');
  return {label:difference?'Review engine difference':reasons.length?'QC review':'Similar estimates',reasons:reasons.length?reasons:['Both fits pass the workspace checks and compared signals differ by no more than 15 percentage points. This does not confirm a genotype.']};
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function csv(rows) {
  const safe=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return rows.map(r=>r.map(safe).join(',')).join('\r\n');
}
