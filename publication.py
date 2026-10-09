"""Reproducible vector chromatogram figures and complete-run PDF reports."""
import csv
import json
import re
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from xml.sax.saxutils import escape
import numpy as np
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt
from matplotlib.lines import Line2D
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, PageBreak, Image, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from chromatograms import COLORS

RENDER_LOCK=Lock()
STYLE={'font.family':'DejaVu Sans','font.size':8,'pdf.fonttype':42,'ps.fonttype':42,
       'svg.fonttype':'none','path.simplify':False,'axes.linewidth':.45}

def short_label(result):
    name=result['sample']
    return Path(name).stem

def percent(value): return '-' if value is None else f'{value*100:.1f}%'

def draw_trace(ax,window,reference,center,variant=None):
    x=np.asarray(window['x']);ys=np.asarray(window['y'])
    lo,hi=window['start'],window['end']
    if not variant:ax.axvspan(center-.42,center+.42,color='#fff0aa',alpha=.75,zorder=0)
    if not variant:ax.axvline(center,color='#846d30',ls=(0,(3,2)),lw=.55,zorder=1)
    for i,color in enumerate(COLORS): ax.plot(x,ys[:,i],color=color,lw=.65,solid_capstyle='round',zorder=2)
    ax.axhline(0,color='#9aa4a3',lw=.35)
    for pos,base in zip(window['positions'],window['calls']):
        color=COLORS['ACGT'.index(base)] if base in 'ACGT' else '#777777'
        ax.text(pos,-.17,base,color=color,ha='center',va='center',fontweight='bold',fontsize=6.5,
                bbox={'facecolor':'#fff0aa','edgecolor':'#dbb744','boxstyle':'round,pad=.13','linewidth':.4} if pos in {v['position'] for v in (variant or [])} else None)
    ax.set(xlim=(lo-.5,hi+.5),ylim=(min(-.28,float(ys.min())-.03),1.08))
    ax.set_xticks([]);ax.set_yticks([])
    for spine in ax.spines.values():spine.set_visible(False)

def build_figure(bundle,indices,roots,out,title,centers,flank,labels):
    selected=[bundle['results'][i] for i in indices]
    rows=[('WT control',selected[0],True)]+[(short_label(r),r,False) for r in selected]
    target=selected[0].get('target_variant') or bundle.get('settings',{}).get('target_variant')
    columns=min(2,len(centers)); blocks=(len(centers)+columns-1)//columns
    height=2.35+blocks*(.95*len(rows)+.6)
    fig=plt.figure(figsize=(8.3,height),facecolor='white')
    fig.text(.04,1-.22/height,title,fontsize=14 if len(title)<58 else 11,fontweight='bold',va='top',color='#183137')
    fig.text(.04,1-.55/height,'Specified substitutions aligned to the WT control read',fontsize=9,va='top',color='#526367')
    note=(f"Intended: {target['label']} | {target['ref']}{target['position']}{target['alt']}" if target else 'Intended mutation not assigned - all specified substitutions are shown')
    fig.text(.04,1-.83/height,note,fontsize=9,va='top',color='#177e70')
    fig.legend(handles=[Line2D([0],[0],color=c,lw=1.3,label=b) for b,c in zip('ACGT',COLORS)],loc='upper right',bbox_to_anchor=(.98,1-.70/height),ncol=4,frameon=False,fontsize=7)
    manifest=[]
    for panel,center in enumerate(centers):
        block,column=divmod(panel,columns)
        top=1-(1.6+block*(.95*len(rows)+.6))/height
        bottom=top-(.95*len(rows)-.18)/height
        left=.23+column*(.74/columns);right=left+.70/columns
        grid=fig.add_gridspec(len(rows),1,left=left,right=right,top=top,bottom=bottom,hspace=.4)
        variants=[v for v in selected[0]['variants'] if selected[0]['displays'][str(center)]['control']['start']<=v['position']<=selected[0]['displays'][str(center)]['control']['end']]
        edits=', '.join(f"{v['ref']}{v['position']}{v['alt']}" for v in variants)
        for row,(label,result,is_control) in enumerate(rows):
            data=result['displays'][str(center)];w=data['control' if is_control else 'sample']
            ax=fig.add_subplot(grid[row,0]);draw_trace(ax,w,data['reference'],center,variants)
            for v in variants:
                pos=v['position'];is_target=bool(target and pos==target['position'])
                ax.axvspan(pos-.42,pos+.42,color='#95dbcb' if is_target else '#fff0aa',alpha=.45,zorder=0)
                if is_target:ax.axvline(pos,color='#177e70',lw=.7,ls='--')
            if row==0:ax.set_title(labels[panel]+'\n'+edits,fontsize=8,fontweight='bold',pad=14)
            if column==0:
                ax.text(-.055,1,'\n'.join(textwrap.wrap(label,23)),transform=ax.transAxes,ha='right',va='top',fontsize=7,fontweight='bold')
                info='WT reference' if is_control else f"Fit R2 {result['metrics']['r_squared']:.3f}\nIndel model {percent(result['metrics']['indel_fraction'])}"
                ax.text(-.055,.40,info,transform=ax.transAxes,ha='right',va='top',fontsize=6,color='#617075')
            if not is_control:
                signals=[v for v in result['variants'] if w['start']<=v['position']<=w['end']]
                text=' | '.join(f"{v['ref']}{v['position']}{v['alt']}: {percent(v['background_corrected_signal'])}" for v in signals)
                ax.text(0,1.05,text,transform=ax.transAxes,ha='left',fontsize=6,color='#526367')
            manifest.append({'row':label,'center':center,'source':w['source'],'sha256':w['hash'],'scale_divisor':w['scale_divisor'],'center_quality':w['center_quality'],'annotated_variants':[v['position'] for v in variants]})
    caption=('Green marks the intended mutation when assigned; yellow marks other specified changes. Labels use 1-based control-read coordinates. '
             'Percentages are background-corrected alternate-channel signal, not allele counts. All raw peaks are retained; one amplitude scale per window. '
             'Other donor changes are not automatically classified as silent or blocking. Signals do not establish genotype or phase.')
    fig.text(.04,.80/height,'\n'.join(textwrap.wrap(caption,145)),fontsize=7,va='top',color='#4f5a5e',linespacing=1.4)
    for name,kwargs in [('chromatogram_figure.pdf',{}),('chromatogram_figure.svg',{}),('chromatogram_figure_600dpi.png',{'dpi':600}),('chromatogram_preview.png',{'dpi':160})]:fig.savefig(out/name,**kwargs)
    plt.close(fig)
    return height,manifest,caption

from visual_report import build_visual_report as build_report, build_deletion_figure

def export_publication(bundle,indices,roots,out,title='Genome editing chromatograms',centers=None,flank=10,labels=None):
    if not isinstance(indices,list) or not 1<=len(indices)<=12 or any(type(i)!=int or not 0<=i<len(bundle['results']) for i in indices):
        raise ValueError('Choose 1–12 analyzed samples for the figure.')
    if len(set(indices))!=len(indices):raise ValueError('Duplicate figure samples.')
    if any('metrics' not in bundle['results'][i] for i in indices):raise ValueError('Failed samples cannot supply aligned chromatograms; they remain in the full report.')
    title=str(title).strip()
    if not title or len(title)>75:raise ValueError('Figure title must contain 1–75 characters.')
    first=bundle['results'][indices[0]]
    centers=centers or list(map(int,first.get('displays',{}))) or first['cuts_after_base'][:2]
    if not 1<=len(centers)<=6 or any(type(c)!=int or c<1 for c in centers):raise ValueError('Choose one to six positive control-read positions.')
    labels=labels or [f"Control window {c}" for c in centers]
    for i in indices:
        r=bundle['results'][i]
        missing=[v['position'] for v in r.get('variants',[]) if not any(r['displays'][str(c)]['control']['start']<=v['position']<=r['displays'][str(c)]['control']['end'] for c in centers)]
        if missing:raise ValueError(f'Specified SNPs {missing} are outside the saved windows. Reanalyze to include every specified change.')
    if len(labels)!=len(centers) or any(len(str(label))>35 for label in labels):raise ValueError('Provide one short label per displayed site.')
    out.mkdir(parents=True,exist_ok=True)
    with RENDER_LOCK,plt.rc_context(STYLE):
        if any(bundle['results'][i].get('deletion_evidence',{}).get('groups') for i in indices):
            height,manifest,caption=build_deletion_figure(bundle,indices,out,title)
        else:
            height,manifest,caption=build_figure(bundle,indices,roots,out,title,centers,int(flank),labels)
        build_report(bundle,indices,out,title,height,caption,centers,labels)
    export={'run_id':bundle['id'],'exporter_version':'0.4.0','exported_utc':datetime.now(timezone.utc).isoformat(),'title':title,'indices':indices,
            'sample_labels':[short_label(bundle['results'][i]) for i in indices],'centers':centers,'site_labels':labels,
            'flank':int(flank),'processing':caption,'trace_sources':manifest,'formats':['vector PDF','vector SVG','PNG 600 dpi'],
            'selection_note':'Explicit display selection. No genotype or positivity assignment.'}
    (out/'export_manifest.json').write_text(json.dumps(export,indent=2),encoding='utf-8')
    (out/'analysis.json').write_text(json.dumps(bundle,indent=2),encoding='utf-8')
    with (out/'sample_metrics.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.writer(stream);writer.writerow(['sample','status','indel_signal_pct','r_squared','snp_signals','warnings'])
        for r in bundle['results']:
            m=r.get('metrics',{});name=r['sample'];name="'"+name if name.startswith(('=','+','-','@')) else name
            writer.writerow([name,r['status'],m.get('indel_fraction',0)*100 if m else '',m.get('r_squared',''),
                             '; '.join(f"{v['ref']}{v['position']}{v['alt']}={v['background_corrected_signal']*100:.2f}%" for v in r.get('variants',[])),
                             r.get('error','; '.join(r.get('warnings',[])))])
    return export
