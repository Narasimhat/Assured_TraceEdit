import copy
from pypdf import PdfReader
from visual_report import display_bins, build_visual_report


def test_minor_outcomes_are_grouped_without_losing_signal():
    r={'outcomes':[{'net_bp':n,'kind':'deletion','fraction':f} for n,f in [(-79,.48),(-84,.47),(-78,.03),(-77,.02)]]}
    assert display_bins(r)=={'-79 bp':.48,'-84 bp':.47,'Other':.05}
    assert display_bins({'error':'failed'})=={}


def test_report_retains_failed_reads_and_equivalent_breakpoints(tmp_path):
    group={'size_bp':79,'fraction':1.,'start':101,'end':179,'equivalent_intervals':[{'start':101,'end':179}], 'min_quality':40}
    good={'sample':'clone.ab1','control':'WT.ab1','status':'review_required','metrics':{'r_squared':.99},'outcomes':[{'net_bp':-79,'kind':'deletion','fraction':1.}], 'deletion_evidence':{'groups':[group]},'warnings':['Review required']}
    failed={'sample':'failed.ab1','control':'WT.ab1','status':'failed','error':'Insufficient anchor'}
    bundle={'id':'test','created_utc':'2026-01-01','results':[good,failed]}
    before=copy.deepcopy(bundle)
    build_visual_report(bundle,[0],tmp_path,'Visual review',8,'',[],[])
    text='\n'.join(p.extract_text() for p in PdfReader(tmp_path/'analysis_report.pdf').pages)
    for expected in ['NO CALL','failed','Insufficient anchor','79 bp deletion','101-179','equivalent breakpoint','Review required']:
        assert expected in text
    assert bundle==before
