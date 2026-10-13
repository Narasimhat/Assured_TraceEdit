"""Stateless publication exports of stored results; never reruns or changes a model."""
import csv
import io
import json
import math
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


def validate_publication(body):
    if not isinstance(body, dict) or body.get('version') != 'publication/1':
        raise ValueError('Unsupported publication report version.')
    rows = body.get('rows')
    if not isinstance(rows, list) or not 1 <= len(rows) <= 96:
        raise ValueError('Publication downloads support 1-96 rows per batch. Export smaller batches for larger runs; full JSON and HTML remain available.')
    if body.get('format', 'pdf') not in ('pdf', 'zip', 'pngzip'):
        raise ValueError('Choose PDF, vector ZIP or a PNG part.')
    if type(body.get('asset_page',0)) != int or not 0 <= body.get('asset_page',0) <= 24:
        raise ValueError('Invalid PNG part.')
    def check(value, depth=0):
        if depth > 24:
            raise ValueError('Report nesting exceeds the limit.')
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('Non-finite report value.')
        if isinstance(value, str) and len(value) > 20000:
            raise ValueError('Report text is too long.')
        if isinstance(value, dict):
            for child in value.values(): check(child, depth+1)
        if isinstance(value, list):
            if len(value) > 12000: raise ValueError('Report array is too large.')
            for child in value: check(child, depth+1)
    check(body)
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('sample'), str):
            raise ValueError('Each row needs a sample name.')
        if row.get('workflow') not in ('snp', 'knockout') or not isinstance(row.get('source'), dict):
            raise ValueError('Invalid workflow or source provenance.')
        if not isinstance(row.get('scores'), dict) or any(not isinstance(row['scores'].get(e), dict) for e in ('aq','te')):
            raise ValueError('Both engine score slots are required; use null for missing values.')
        for key in ('reasons', 'warnings', 'markers', 'sizes'):
            if not isinstance(row.get(key), list): raise ValueError('Missing report lists.')
        for engine in ('aq', 'te'):
            scores = row.get('scores', {}).get(engine, {})
            for key in ('indel', 'ko'):
                v = scores.get(key)
                if v is not None and (type(v) not in (int, float) or not 0 <= v <= 1.001):
                    raise ValueError('Screening contributions must be between zero and one.')
        for size in row['sizes']:
            if not isinstance(size, list) or len(size) != 2 or type(size[0]) != int or not isinstance(size[1], (int, float)) or not 0 <= size[1] <= 1.001:
                raise ValueError('Invalid deletion-size contribution.')
    return body


def export_report(body, out):
    validate_publication(body)
    import matplotlib
    matplotlib.use('Agg')
    from matplotlib import pyplot as plt
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    out = Path(out)
    rows = body['rows']
    palette = ['#147e88', '#785eaa']
    plt.rcParams.update({'svg.fonttype': 'none', 'pdf.fonttype': 42, 'font.size': 9})
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='ReportBody', fontSize=9, leading=13, spaceAfter=9, textColor=colors.HexColor('#183b43')))
    styles.add(ParagraphStyle(name='ReportSmall', fontSize=7.5, leading=10, spaceAfter=4))
    def p(text, style='ReportBody'): return Paragraph(escape(str(text)), styles[style])
    def pct(v): return 'Not available' if v is None else f'{v*100:.1f}%'
    def table(headers, data, widths):
        t = Table([[p(v, 'ReportSmall') for v in headers]]+[[p(v, 'ReportSmall') for v in row] for row in data], colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor('#eaf1f2')), ('LINEBELOW',(0,0),(-1,-1),.3,colors.HexColor('#dbe5e8')), ('VALIGN',(0,0),(-1,-1),'TOP'), ('TOPPADDING',(0,0),(-1,-1),5), ('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        return t
    width = A4[0]-80
    selected = sorted([r for r in rows if r.get('selected')], key=lambda r: (r.get('action') != 'First choice', r['sample']))
    story = [p(body.get('title', 'Clone review'), 'Title'), p('Clone selection report', 'Heading2'), p(f"{str(body.get('created') or '')[:10]} | {len(rows)} reads | Stored analysis results"), p('Validation shortlist', 'Heading2')]
    if selected:
        story.append(table(['Sample', 'Priority', 'Reason / next step'], [[r['sample'], r['action'], ' '.join(r['reasons'])] for r in selected], [150,80,width-230]))
    else: story.append(p('No clones meet all screening checks. Review the per-sample reasons; a missing recommendation is not a zero editing score.'))
    story.extend([Spacer(1,12), p('Before downstream use', 'Heading2'), p('Confirm clone identity and the complete edit genotype. For knockout candidates, validate protein loss by Western blot. Review SNP-array/karyotype, identity and contamination QC before banking; document passage, provenance and post-thaw QC. These validation results are not inferred from sequencing.'), p('Screening values are fitted contributions or dye-channel signals, not calibrated genotype or protein-loss probabilities. QC and TraceEdit scores are kept separate. Recommendations are provisional, rule-based review decisions; at most six per control/target group.'), PageBreak()])
    engines = ('aq', 'te') if any(r.get('aqSource') for r in rows) else ('te',)
    exports = []
    def save(fig, name):
        for ext in ('svg','pdf'): fig.savefig(out/f'{name}.{ext}', bbox_inches='tight')
        fig.savefig(out/f'{name}.png', dpi=180, bbox_inches='tight')
        if body.get('format') == 'pngzip': fig.savefig(out/f'{name}_600dpi.png', dpi=600, bbox_inches='tight')
        plt.close(fig)
        exports.append(name)
    # Paginate large batches to keep labels readable and rendering bounded.
    for page, start in enumerate(range(0,len(rows),12),1):
        subset = rows[start:start+12]
        fig, axes = plt.subplots(1,2,figsize=(10, max(3, 1.4+len(subset)*.55)), sharey=True)
        for i,r in enumerate(subset):
            for j,e in enumerate(engines):
                for col,key in enumerate(('indel','ko' if r['workflow']=='knockout' else 'target')):
                    v = r['scores'][e].get(key) if key!='target' else (r.get('target') if e=='te' else r.get('aqTarget'))
                    if v is None: axes[col].text(1,i+(j-.5)*.28,'N/A',fontsize=6,va='center',color=palette[j])
                    else:
                        axes[col].barh(i+(j-.5)*.28,100*v,.24,color=palette[j],label=e.upper() if i==0 else None)
                        axes[col].text(101,i+(j-.5)*.28,f'{100*v:.1f}%',fontsize=6,va='center',color=palette[j])
        axes[0].set_yticks(range(len(subset)), [r['sample'][:38] for r in subset])
        for axis,title in zip(axes,('Indel score','KO screening / intended-base signal')):
            axis.set(xlim=(0,127),xticks=[0,50,100],ylim=(len(subset)-.5,-.8),xlabel='Contribution / signal (%)',title=title)
            axis.spines[['top','right']].set_visible(False)
        from matplotlib.patches import Patch
        fig.legend(handles=[Patch(color=palette[j],label='QC' if e=='aq' else 'TraceEdit') for j,e in enumerate(engines)],loc='lower center',ncol=len(engines),frameon=False)
        fig.tight_layout(rect=[0,.05,1,1]);name=f'screening_{page}';save(fig,name)
        story.extend([p(f'Screening results {start+1}-{start+len(subset)}','Heading2'), Image(str(out/f'{name}.png'),width=width,height=width*max(3,1.4+len(subset)*.55)/10),p('Predicted KO screening sums non-triplet or >=21 bp net changes. Intended-base signal is not an HDR allele fraction. N/A means unavailable, never zero. Mixed workflows are labelled in the table below.','ReportSmall'),table(['Sample / workflow','Next step','Reason'], [[r['sample']+' / '+r['workflow'],r['action'],' '.join(r['reasons'])] for r in subset],[155,90,width-245]),PageBreak()])
    # Native trace evidence is already oriented/scaled by the analysis engine.
    evidence_count=0
    for r in selected:
        evidence=r.get('evidence') or {}
        junction=evidence.get('junction')
        displays=evidence.get('displays') or []
        if not junction and not displays: continue
        if evidence_count>=12: break
        fig,ax=plt.subplots(figsize=(10,3))
        windows=[('Observed junction',junction.get('trace'))] if junction else [(role,d.get(role)) for d in displays[:3] for role in ('control','sample')]
        ax.remove();axes=fig.subplots(len(windows),1,squeeze=False).ravel()
        fig.set_size_inches(10,max(3,1.3*len(windows)))
        for axis,(label,w) in zip(axes,windows):
            if not w: axis.text(.1,.5,'Native trace unavailable');continue
            if not isinstance(w.get('x'),list) or not isinstance(w.get('y'),list) or len(w['x'])!=len(w['y']): raise ValueError('Invalid native trace arrays.')
            for c,color in enumerate(('#16a05a','#2568bc','#252525','#e23b37')): axis.plot(w['x'],[v[c] for v in w['y']],color=color,lw=.8)
            for m in r['markers']:
                if w['start']<=m['position']<=w['end']: axis.axvspan(m['position']-.4,m['position']+.4,color='#8060ad' if m.get('intended') else '#d29c42',alpha=.18)
            if junction: axis.axvline(junction['sample_junction_after_base']+.5,color='#b44b42',ls='--',lw=.8)
            for pos,base in zip(w['positions'],w['calls']): axis.text(pos,-.15,base,ha='center',fontsize=6)
            axis.set(xlim=(w['start']-.5,w['end']+.5),ylim=(-.32,1.35),yticks=[],xticks=[],ylabel=label)
            axis.spines[['top','right','left','bottom']].set_visible(False)
        fig.suptitle(r['sample'][:90],fontsize=11)
        fig.tight_layout(rect=[0,0,1,.92]);name=f'evidence_{evidence_count+1}';save(fig,name);evidence_count+=1
        story.extend([p(r['sample'],'Heading2'),p('Control: '+str(r.get('control') or r['source'].get('control') or 'Unspecified')),Image(str(out/f'{name}.png'),width=width,height=width*max(3,1.3*len(windows))/10)])
        if junction: story.append(p(f"{junction['size_bp']} bp deletion; {pct(junction['fraction'])} sequence-model contribution; WT-read bases {junction['start']}-{junction['end']}. {len(junction.get('equivalent_intervals',[]))} equivalent breakpoint placement(s). Junction: {junction['matching_calls']}/{junction['compared_calls']} calls match, min Q{junction['min_quality']}."))
        else: story.append(table(['WT-read change','Role','TE raw signal'],[[str(m['ref'])+str(m['position'])+str(m['alt']),'Intended' if m.get('intended') else 'Donor marker',pct(m.get('sample_alt_signal'))] for m in r['markers']],[130,150,width-280]))
        story.extend([p('A green, C blue, G black, T red. Raw native scans retained without smoothing. Each window has its own amplitude scale. Purple marks intended bases; amber marks other donor changes. Marker ratios are unphased; indels can disrupt positional interpretation.','ReportSmall'),PageBreak()])
    story.extend([p('Methods and provenance','Heading2'),p(f'Evidence figures cover {evidence_count} shortlisted samples with available native traces (maximum 12); all {len(rows)} rows are retained in the results. Figure coordinates belong to each paired WT read. Results from different controls are not merged.'),p('Recommendation rules: confirmed project/pairing; matching input hashes across engines; acceptable trace quality and fit. SNP candidates require >=95% signal at every intended base, <=1% fitted indels, and model agreement. Mixed donor markers require phasing. KO candidates require >=80% screening contribution, >=90% dominant deletion, fully matching junction calls and min Q30. Additional coding/NMD information belongs in the detailed engine reports; none is inferred by this exporter.'),p('No confirmed homozygosity, functional knockout, calibrated confidence bound, biological replication or banking clearance is asserted. A second engine with failed or mismatched input blocks joint prioritization. Missing evidence remains missing.'),p('Engine versions: '+json.dumps(body.get('engines',{}),ensure_ascii=True),'ReportSmall'),p('Read warnings and exact settings in the per-sample data and manifest. This report renders stored results without rerunning either model.','ReportSmall')])
    for r in rows:
        if r['warnings'] or r.get('error'): story.append(p(r['sample']+': '+'; '.join(r['warnings']+[r['error']] if r.get('error') else r['warnings']),'ReportSmall'))
    def footer(canvas,doc):
        canvas.setFont('Helvetica',8);canvas.drawString(40,24,'ASSURED | publication/1 | Screening predictions require validation');canvas.drawRightString(A4[0]-40,24,str(doc.page))
    SimpleDocTemplate(str(out/'clone_report.pdf'),pagesize=A4,leftMargin=40,rightMargin=40,topMargin=38,bottomMargin=48).build(story,onFirstPage=footer,onLaterPages=footer)
    (out/'manifest.json').write_text(json.dumps(body,indent=2,allow_nan=False),encoding='utf8')
    with (out/'results.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.writer(f);writer.writerow(['Sample','Control','Workflow','Action','QC indel %','TE indel %','QC KO %','TE KO %','TE intended signal %','Reasons'])
        for r in rows:
            fields=[r['sample'],r.get('control'),r['workflow'],r['action'],*[pct(r['scores'][e].get(k)) for k in ('indel','ko') for e in ('aq','te')],pct(r.get('target')),' '.join(r['reasons'])]
            writer.writerow(["'"+str(v) if str(v).startswith(('=','+','-','@','\t','\r')) else v for v in fields])
    (out/'figure_legends.txt').write_text('Screening panels: independent QC and TraceEdit signal/model contributions; not probabilities. KO proxy: non-triplet or >=21 bp net changes. Intended signal: minimum across selected target sites.\nEvidence panels: native raw scans with per-window amplitude scaling, intended changes in purple and other donor changes in amber. Junction locations and equivalent boundaries are inferred sequence models, not allele counts.\n',encoding='utf8')
    if body.get('format')=='pngzip':
        names=exports[body.get('asset_page',0)*2:(body.get('asset_page',0)+1)*2]
        if not names: raise ValueError('This PNG part has no figures.')
        with zipfile.ZipFile(out/'figures_600dpi.zip','w',zipfile.ZIP_DEFLATED) as z:
            for name in names: z.write(out/f'{name}_600dpi.png',f'{name}_600dpi.png')
            z.write(out/'figure_legends.txt','figure_legends.txt')
        return out/'figures_600dpi.zip'
    if body.get('format')=='zip':
        with zipfile.ZipFile(out/'publication.zip','w',zipfile.ZIP_DEFLATED) as z:
            for f in out.iterdir():
                if f.name!='publication.zip' and f.suffix!='.png': z.write(f,f.name)
        return out/'publication.zip'
    return out/'clone_report.pdf'
