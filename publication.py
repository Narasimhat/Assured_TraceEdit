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
    ax.axvspan(center-.42,center+.42,color='#fff0aa',alpha=.75,zorder=0)
    ax.axvline(center,color='#846d30',ls=(0,(3,2)),lw=.55,zorder=1)
    for i,color in enumerate(COLORS): ax.plot(x,ys[:,i],color=color,lw=.65,solid_capstyle='round',zorder=2)
    ax.axhline(0,color='#9aa4a3',lw=.35)
    for pos,base in zip(window['positions'],window['calls']):
        color=COLORS['ACGT'.index(base)] if base in 'ACGT' else '#777777'
        ax.text(pos,-.17,base,color=color,ha='center',va='center',fontweight='bold',fontsize=6.5,
                bbox={'facecolor':'#fff0aa','edgecolor':'#dbb744','boxstyle':'round,pad=.13','linewidth':.4} if pos==center else None)
    ax.set(xlim=(lo-.5,hi+.5),ylim=(min(-.28,float(ys.min())-.03),1.08))
    ax.set_xticks([]);ax.set_yticks([])
    for spine in ax.spines.values():spine.set_visible(False)

def build_figure(bundle,indices,roots,out,title,centers,flank,labels):
    selected=[bundle['results'][i] for i in indices]
    rows=[('WT control',selected[0],True)]+[(short_label(r),r,False) for r in selected]
    cache={}
    for i,r in zip(indices,selected):
        for center in centers: cache[(i,center)]=r['displays'][str(center)]
    # 7.2 inches is close to a full-width journal figure; type remains readable at native size.
    height=2.0+.72*len(rows)
    fig=plt.figure(figsize=(7.2,height),facecolor='white')
    fig.text(.045,.974,title,fontsize=13 if len(title)<58 else 10.5,fontweight='bold',va='top',color='#183137')
    fig.text(.045,.934,'Continuous Sanger dye traces aligned to control-read positions',fontsize=8,color='#526367')
    handles=[Line2D([0],[0],color=color,lw=1.3,label=base) for base,color in zip('ACGT',COLORS)]
    fig.legend(handles=handles,loc='upper right',bbox_to_anchor=(.965,.941),ncol=4,frameon=False,
               fontsize=7,handlelength=1.5,columnspacing=1.0)
    top=.865;bottom=.12
    grid=fig.add_gridspec(len(rows),len(centers),left=.23,right=.97,top=top,bottom=bottom,hspace=.3,wspace=.12)
    manifest=[]
    for row,(label,result,is_control) in enumerate(rows):
        sample_index=indices[0] if is_control else indices[row-1]
        for column,center in enumerate(centers):
            data=cache[(sample_index,center)];w=data['control' if is_control else 'sample']
            ax=fig.add_subplot(grid[row,column]);draw_trace(ax,w,data['reference'],center)
            if row==0:
                ax.set_title(f"{labels[column]}\nControl base {center}",loc='center',fontsize=8,fontweight='bold',pad=10)
            if column==0:
                ax.text(-.045,1.0,'\n'.join(textwrap.wrap(label,20)),transform=ax.transAxes,ha='right',va='top',fontsize=7.2,fontweight='bold')
                info='WT reference' if is_control else f"R² {result['metrics']['r_squared']:.3f}\nIndel model {percent(result['metrics']['indel_fraction'])}"
                ax.text(-.045,.45,info,transform=ax.transAxes,ha='right',va='top',fontsize=6.2,color='#617075')
            variant=next((v for v in result['variants'] if v['position']==center),None)
            if variant and not is_control:
                ax.text(.98,1.02,f"Alt signal {percent(variant['background_corrected_signal'])} | Q{w['center_quality']}",
                        transform=ax.transAxes,ha='right',va='bottom',fontsize=5.9,color='#526367')
            manifest.append({'row':label,'center':center,'source':w['source'],'sha256':w['hash'],
                             'scale_divisor':w['scale_divisor'],'center_quality':w['center_quality']})
    caption=('Yellow bands mark the selected control-read positions. Letters are instrument base calls; mixed peaks may have a single call. '
             'All instrument-analyzed scans are retained, without smoothing or baseline subtraction. Each window uses one amplitude scale '
             'shared by A/C/G/T; heights are not comparable between rows. Horizontal spacing is mapped using called base positions. '
             'Signals do not establish genotype or phase; inspect QC in the accompanying report.')
    fig.text(.045,.079,'\n'.join(textwrap.wrap(caption,125)),fontsize=6.2,va='top',color='#4f5a5e',linespacing=1.5)
    fig.savefig(out/'chromatogram_figure.pdf')
    fig.savefig(out/'chromatogram_figure.svg')
    fig.savefig(out/'chromatogram_figure_600dpi.png',dpi=600)
    fig.savefig(out/'chromatogram_preview.png',dpi=160)
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
    centers=centers or [v['position'] for v in first['variants'][:2]] or first['cuts_after_base'][:2]
    if not 1<=len(centers)<=2 or any(type(c)!=int or c<1 for c in centers):raise ValueError('Choose one or two positive control-read positions.')
    labels=labels or [f"Site {c}" for c in centers]
    if len(labels)!=len(centers) or any(len(str(label))>35 for label in labels):raise ValueError('Provide one short label per displayed site.')
    out.mkdir(parents=True,exist_ok=True)
    with RENDER_LOCK,plt.rc_context(STYLE):
        if any(bundle['results'][i].get('deletion_evidence',{}).get('groups') for i in indices):
            height,manifest,caption=build_deletion_figure(bundle,indices,out,title)
        else:
            height,manifest,caption=build_figure(bundle,indices,roots,out,title,centers,int(flank),labels)
        build_report(bundle,indices,out,title,height,caption,centers,labels)
    export={'run_id':bundle['id'],'exporter_version':'0.3.0','exported_utc':datetime.now(timezone.utc).isoformat(),'title':title,'indices':indices,
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
