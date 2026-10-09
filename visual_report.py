"""Results-first, vector PDF summaries using saved evidence, never inferred labels."""
from collections import defaultdict
import textwrap
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.graphics.shapes import Drawing, Rect, Line, String, PolyLine
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image, KeepTogether

INK='#203c39'; MUTED='#5c706b'; PALETTE=['#177e89','#db8437','#786bb0','#4b9974','#ba5a70','#517aa5']
DYES=['#16a05a','#2568bc','#252525','#e23b37']

def outcome_bins(result):
    bins=defaultdict(float)
    for o in result.get('outcomes',[]):
        key = f"{o['net_bp']:+d} bp" if o['net_bp'] else ('WT' if o['kind']=='wild_type' else 'Substitution')
        bins[key] += float(o['fraction'])
    return dict(bins)

def display_bins(result):
    bins=outcome_bins(result)
    major={k:v for k,v in bins.items() if v>=.05}
    minor=sum(v for v in bins.values() if v<.05)
    if minor:major['Other']=minor
    return major

def overview(results, labels, color_map):
    h=70+len(results)*31
    d=Drawing(510,h)
    def text(x,y,s,size=9,color=INK):d.add(String(x,y,str(s),fontName='Helvetica',fontSize=size,fillColor=colors.HexColor(color)))
    text(0,h-12,'Sample');text(91,h-12,'Fitted signal contribution');text(423,h-12,'Fit R2');text(467,h-12,'QC')
    for i,(r,label) in enumerate(zip(results,labels)):
        y=h-43-i*31;text(0,y+5,label,10)
        if not r.get('metrics'):
            d.add(Rect(91,y,312,20,fillColor=colors.HexColor('#f3e3e0'),strokeColor=None));text(101,y+6,'NO CALL - analysis failed',8,'#983c31');text(423,y+5,'-');text(467,y+5,'Failed',8,'#983c31');continue
        x=91
        for key,value in sorted(display_bins(r).items(),key=lambda kv:-kv[1]):
            width=312*value;fill=color_map[key]
            d.add(Rect(x,y,width,20,fillColor=colors.HexColor(fill),strokeColor=None))
            if value>=.12:text(x+4,y+6,f'{key}: {value*100:.0f}%',7,'#ffffff' if key!='Other' else INK)
            x+=width
        text(423,y+5,f"{r['metrics']['r_squared']:.3f}",8)
        text(467,y+5,'Review' if r['status']=='review_required' else 'Fit OK',8,'#8b641d' if r['status']=='review_required' else '#286958')
    for value in [0,25,50,75,100]:text(91+312*value/100-4,14,f'{value}%',7,MUTED)
    return d

def evidence_card(group, result, members):
    """One representative repair model; whole-sample raw trace stays unaltered."""
    d=Drawing(510,262)
    def text(x,y,s,size=9,color=INK,font='Helvetica'):
        d.add(String(x,y,str(s),fontName=font,fontSize=size,fillColor=colors.HexColor(color)))
    d.add(Rect(0,0,510,262,rx=8,fillColor=colors.HexColor('#f5f8f7'),strokeColor=colors.HexColor('#dbe5e0')))
    text(14,241,f"{group['size_bp']} bp deletion",14,font='Helvetica-Bold')
    for line_no,line in enumerate(textwrap.wrap('Model contribution: '+', '.join(members),112)):
        text(14,224-line_no*10,line,8)
    text(14,201,'WT',8);text(14,178,'Model',8)
    for y in [196,173]:
        d.add(Rect(76,y,105,13,fillColor=colors.HexColor('#247c71'),strokeColor=None));d.add(Rect(385,y,105,13,fillColor=colors.HexColor('#247c71'),strokeColor=None))
    d.add(Rect(181,196,204,13,fillColor=colors.HexColor('#f1ccc3'),strokeColor=None))
    text(224,199,f"bases {group['start']}-{group['end']}",8)
    d.add(Line(181,179,385,179,strokeColor=colors.HexColor('#b95340'),strokeDashArray=[4,3]))
    text(220,163,f"{group['size_bp']} bp removed",8,'#a24435')
    text(14,147,f"{len(group['equivalent_intervals'])} equivalent breakpoint placement(s). Diagram not to scale.",7,MUTED)
    w=group.get('trace')
    if w:
        x=lambda v: 76+(v-w['start']+.5)/(w['end']-w['start']+1)*414
        junction=x(group['sample_junction_after_base']+.5)
        for channel,color in enumerate(DYES):
            points=[]
            for pos,ys in zip(w['x'],w['y']):points.extend([x(pos),60+ys[channel]*51])
            d.add(PolyLine(points,strokeColor=colors.HexColor(color),strokeWidth=.55))
        d.add(Line(junction,48,junction,130,strokeColor=colors.HexColor('#b95340'),strokeDashArray=[3,2]))
        text(junction+5,124,'predicted junction',7,'#a24435')
        text(14,92,'Observed',7);text(14,81,result['_display_id'],8,font='Helvetica-Bold')
        for pos,call in zip(w['positions'],w['calls']):text(x(pos)-2.5,49,call,7)
    else:text(76,92,'Junction trace unavailable in this saved session.',9,MUTED)
    if group.get('expected_junction'):
        text(14,32,'Expected',7);text(76,32,group['expected_junction'][:12]+' | '+group['expected_junction'][12:],8,font='Courier')
        text(295,32,f"Calls match: {group['matching_calls']}/{group['compared_calls']} | min Q{group['min_quality']}",8)
    text(14,14,'Whole-sample calls and peaks; mixed alleles are not separated. A green / C blue / G black / T red.',7,MUTED)
    return d

def build_visual_report(bundle,indices,out,title,height,caption,centers,labels):
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='BodySmall',fontSize=8,leading=11,spaceAfter=7,textColor=colors.HexColor(MUTED)))
    styles.add(ParagraphStyle(name='CellSmall',fontSize=7,leading=10))
    styles['Title'].alignment=0;styles['Title'].fontSize=23;styles['Title'].leading=27
    styles['Heading2'].textColor=colors.HexColor(INK)
    p=lambda s,style='BodySmall':Paragraph(escape(str(s)),styles[style])
    results=[dict(r,_display_id=f'S{i+1:02d}') for i,r in enumerate(bundle['results'])]
    all_bins={k for r in results for k in display_bins(r)}
    keys=sorted(all_bins,key=lambda k:(k in ('WT','Substitution'),k))
    color_map={k:PALETTE[i%len(PALETTE)] for i,k in enumerate(keys)}
    if 'WT' in keys:color_map['WT']='#71847f'
    # Minor components are retained numerically in JSON; only major global bins get a distinct colour.
    major=all_bins-{'Other'}
    small=all_bins-major
    color_map={k:(color_map[k] if k not in small else '#b8c4bf') for k in keys}
    successful=sum(bool(r.get('metrics')) for r in results)
    story=[p(title,'Title'),p('EDITING EVIDENCE / VISUAL REVIEW'),Spacer(1,8),p(f"{len(results)} reads  |  {successful} fitted  |  {len(results)-successful} no calls",'Heading2'),
           p('Start with the outcome bars. Different deletion sizes have different colours; a failed read is shown as no call, never as wild type.')]
    for start in range(0,len(results),14):
        if start:story.extend([PageBreak(),p('Outcome overview - continued','Heading2')])
        rows=results[start:start+14];story.append(overview(rows,[r['_display_id'] for r in rows],color_map))
        legend='   |   '.join(sorted(major))+('   |   Grey: minor components (<5% per read)' if small else '')
        story.append(p(legend))
    story.extend([p('Percentages describe fitted trace signal, not cell or allele counts. Fit R2 measures agreement with the model; it does not confirm genotype or functional knockout.'),
                  p('Sample key','Heading2')])
    # Short names remain unique because display IDs are always shown.
    key_rows=[[p('ID','CellSmall'),p('Sample','CellSmall'),p('Finding / follow-up','CellSmall')]]
    for r in results:
        bins=outcome_bins(r)
        finding='; '.join(f'{k}: {v*100:.1f}%' for k,v in sorted(bins.items(),key=lambda kv:-kv[1]) if v>=.05)
        if not r.get('metrics'):finding='No call: '+r.get('error','Analysis failed')
        name=Path(r['sample']).stem
        key_rows.append([p(r['_display_id'],'CellSmall'),p(name,'CellSmall'),p(finding,'CellSmall')])
    table=Table(key_rows,colWidths=[32,239,240],repeatRows=1)
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e4eee9')),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f6f8f7')])]))
    story.append(table)
    # Group the SAME repaired sequence only, and only for figure-selected reads.
    groups={}
    for i in indices:
        r=results[i]
        for g in r.get('deletion_evidence',{}).get('groups',[]):
            spans=tuple((v['start'],v['end']) for v in g['equivalent_intervals'])
            key=(r.get('source_hashes',{}).get('control',r['control']),g['size_bp'],spans)
            entry=groups.setdefault(key,{'g':g,'r':r,'members':[]})
            entry['members'].append(f"{r['_display_id']} {g['fraction']*100:.1f}%")
            if g.get('min_quality',-1)>entry['g'].get('min_quality',-1):entry.update(g=g,r=r)
    for j,entry in enumerate(groups.values()):
        if j%2==0:
            story.extend([PageBreak(),p('Where is the deletion?','Heading2'),p('Control-read positions, 1-based inclusive. Equivalent repaired sequences share a card; the trace shown is the member with the highest minimum junction quality. This display choice is not a clone ranking.')])
        story.extend([evidence_card(entry['g'],entry['r'],entry['members']),Spacer(1,14)])
    if not groups:
        story.extend([PageBreak(),p('Selected trace evidence','Heading2'),p('Marked positions follow the control read. Alternate-channel signal is not a calibrated allele fraction.')])
        width=min(510,650*7.2/height)
        story.append(Image(str(out/'chromatogram_preview.png'),width=width,height=width*height/7.2))
    story.extend([PageBreak(),p('QC & methods appendix','Heading2')])
    warnings=defaultdict(list)
    for r in results:
        for warning in r.get('warnings',[]):warnings[warning].append(r['_display_id'])
        if r.get('error'):warnings[r['error']].append(r['_display_id'])
    for warning,ids in warnings.items():story.append(p(', '.join(ids)+': '+warning))
    story.append(p('Display and interpretation','Heading2'))
    for text in ['Signal mixtures are fitted with bounded nonnegative least squares. Deletion boundaries are model proposals; repeated bases can produce equivalent breakpoints. No functional knockout or allele phase is assigned.',
                 'Continuous traces retain the instrument scans with one amplitude scale per window. No smoothing or removal of secondary peaks. Dashed lines mark predicted sample junctions; schematic gaps are not to scale.',
                 'The overview includes every sample, including failed reads. Detailed evidence cards cover only the explicitly selected samples. Full parameters, minor outcomes and SHA-256 source hashes remain in the analysis JSON and export manifest.']:
        story.append(p(text))
    story.append(p('Run: '+bundle['id']+' | '+bundle['created_utc']))
    story.append(p('Selected: '+', '.join(results[i]['_display_id'] for i in indices)))
    controls=defaultdict(list)
    for r in results:controls[r.get('control','Unavailable')].append(r['_display_id'])
    for control,ids in controls.items():story.append(p('Control for '+', '.join(ids)+': '+control))
    def footer(canvas,doc):
        canvas.setFillColor(colors.HexColor(MUTED));canvas.setFont('Helvetica',7)
        canvas.drawString(42,24,'ASSURED TraceEdit | Research evidence');canvas.drawRightString(A4[0]-42,24,str(doc.page))
    SimpleDocTemplate(str(out/'analysis_report.pdf'),pagesize=A4,leftMargin=42,rightMargin=42,topMargin=36,bottomMargin=40,title=title).build(story,onFirstPage=footer,onLaterPages=footer)


def build_deletion_figure(bundle,indices,out,title):
    """An annotated figure of each selected sample's largest sequence contribution."""
    import numpy as np
    from matplotlib import pyplot as plt
    from matplotlib.lines import Line2D
    selected=[bundle['results'][i] for i in indices]
    height=2.1+len(selected)*1.05
    fig=plt.figure(figsize=(8.3,height),facecolor='white')
    fig.text(.04,.975,title,fontsize=14,fontweight='bold',va='top',color=INK)
    fig.text(.04,.937,'Deletion boundaries + observed junction evidence',fontsize=9,color=MUTED)
    grid=fig.add_gridspec(len(selected),2,left=.22,right=.97,top=.86,bottom=.12,width_ratios=[1,1.65],hspace=.8,wspace=.24)
    manifest=[]
    for row,r in enumerate(selected):
        g=max(r.get('deletion_evidence',{}).get('groups',[]),key=lambda g:g['fraction'],default=None)
        a=fig.add_subplot(grid[row,0]);b=fig.add_subplot(grid[row,1]);a.set_axis_off();b.set_axis_off()
        short=Path(r['sample']).stem
        short=short.split('_EF')[0]
        a.text(-.12,.9,f'S{indices[row]+1:02d}\n'+ '\n'.join(textwrap.wrap(short,20)),transform=a.transAxes,ha='right',va='top',fontsize=7,fontweight='bold')
        if not g:
            a.text(0,.5,'No deletion sequence\nabove display threshold',fontsize=8);continue
        a.set(xlim=(0,1),ylim=(0,1))
        a.plot([.03,.28],[.58,.58],color='#247c71',lw=8);a.plot([.72,.97],[.58,.58],color='#247c71',lw=8)
        a.plot([.28,.72],[.58,.58],color='#b95340',ls='--',lw=1)
        a.text(.5,.95,f"-{g['size_bp']} bp | {g['fraction']*100:.1f}%",ha='center',fontsize=9,fontweight='bold')
        a.text(.5,.22,f"control {g['start']}-{g['end']}",ha='center',fontsize=7)
        mixed=sum(v>=.05 for v in outcome_bins(r).values())>1
        note='Mixed model - see report' if mixed else f"{len(g['equivalent_intervals'])} breakpoint placement(s)"
        a.text(.5,-.08,note,ha='center',fontsize=6,color='#986315' if mixed else MUTED)
        w=g.get('trace')
        if w:
            x=np.asarray(w['x']);ys=np.asarray(w['y'])
            for c,color in enumerate(DYES):b.plot(x,ys[:,c],color=color,lw=.7)
            junction=g['sample_junction_after_base']+.5
            b.axvline(junction,color='#b95340',ls='--',lw=.8)
            b.annotate('junction',xy=(junction,1.02),xytext=(junction+2,1.27),fontsize=6,color='#a24435',arrowprops={'arrowstyle':'->','lw':.6,'color':'#a24435'})
            for pos,base in zip(w['positions'],w['calls']):b.text(pos,-.19,base,ha='center',fontsize=6)
            b.set(xlim=(w['start']-.5,w['end']+.5),ylim=(-.35,1.4))
            b.text(.99,1.04,f"{g['matching_calls']}/{g['compared_calls']} calls match | min Q{g['min_quality']}",transform=b.transAxes,ha='right',fontsize=6,color=MUTED)
            manifest.append({'row':r['sample'],'source':w['source'],'sha256':w['hash'],'sample_junction_after_base':g['sample_junction_after_base'],'representative_control_interval':[g['start'],g['end']],'scale_divisor':w['scale_divisor']})
        else:b.text(0,.5,'Junction trace unavailable; reanalyze source reads.',fontsize=7)
    fig.legend(handles=[Line2D([0],[0],color=c,lw=1,label=b) for b,c in zip('ACGT',DYES)],loc='upper right',bbox_to_anchor=(.98,.93),ncol=4,frameon=False,fontsize=7)
    caption='Percentages are fitted signal contributions, not allele counts or confirmed genotypes. Each row shows the largest deletion-sequence model; mixed samples have additional models in the report. Dashed gap: proposed deletion (not to scale). Vertical dashed line: predicted junction in the oriented sample read. All raw peaks retained; one amplitude scale per window.'
    fig.text(.04,.072,'\n'.join(textwrap.wrap(caption,145)),fontsize=6.5,color=MUTED,va='top')
    for name,kwargs in [('chromatogram_figure.pdf',{}),('chromatogram_figure.svg',{}),('chromatogram_figure_600dpi.png',{'dpi':600}),('chromatogram_preview.png',{'dpi':160})]:fig.savefig(out/name,**kwargs)
    plt.close(fig)
    return height,manifest,caption
