from pathlib import Path
import os,json,re,hashlib,zipfile,collections,time
import argparse
parser=argparse.ArgumentParser(description='Index a local project directory')
parser.add_argument('root',type=Path)
ROOT=parser.parse_args().root.resolve()
DISPLAY_ROOT=ROOT
ROOT=Path('\\\\?\\'+str(ROOT)) if os.name=='nt' else ROOT
APP=Path(__file__).resolve().parents[1]
OUT=APP/'public'/'catalog';OUT.mkdir(parents=True,exist_ok=True)
SEQ={'.ab1','.abi','.scf','.seq','.fasta','.fa','.fastq','.fq','.bam','.sam','.vcf'}
REF={'.gb','.gbk','.genbank','.dna'}
def category(name):
 e=Path(name).suffix.lower()
 return 'Sequencing' if e in SEQ else 'Reference' if e in REF else 'Archive' if e in {'.zip','.7z','.rar'} else 'Spreadsheet' if e in {'.xlsx','.xls','.csv','.tsv'} else 'Document' if e in {'.pdf','.docx','.doc','.txt','.html','.htm','.md'} else 'Image / instrument' if e in {'.png','.jpg','.jpeg','.tif','.tiff','.scn','.czi','.nd2'} else 'Other'
projects={};errors=[];n=0;members=0;started=time.time()
def issue(path,error):errors.append({'path':str(path),'error':str(error)})
for base,dirs,files in os.walk(ROOT,onerror=lambda e:issue(e.filename,e),followlinks=False):
 for name in files:
  p=Path(base)/name;rel=p.relative_to(ROOT);top=rel.parts[0]
  isyear=bool(re.fullmatch(r'20\d\d_GE',top))
  project='/'.join(rel.parts[:2]) if isyear and len(rel.parts)>2 else (top if len(rel.parts)>1 else '[Root files]')
  years=re.findall(r'20\d\d',top);year='/'.join(dict.fromkeys(years)) or 'Unspecified'
  key=hashlib.sha256(project.encode()).hexdigest()[:16]
  group=projects.setdefault(key,{'id':key,'name':project,'year':year,'files':[]})
  try:st=p.stat()
  except OSError as e:issue(p,e);continue
  rec={'id':hashlib.sha256(str(rel).encode()).hexdigest()[:24],'path':str(rel),'name':name,'category':category(name),'bytes':st.st_size,'modified_unix':st.st_mtime,'extension':p.suffix.lower(),'source':'file'}
  group['files'].append(rec);n+=1
  if p.suffix.lower()=='.zip':
   try:
    with zipfile.ZipFile(p) as z:
     for entry in z.infolist():
      if entry.is_dir():continue
      item={'id':hashlib.sha256((str(rel)+'!'+entry.filename).encode()).hexdigest()[:24],'path':str(rel)+'!'+entry.filename,'name':Path(entry.filename).name,'category':category(entry.filename),'bytes':entry.file_size,'source':'zip member','archive_path':str(rel),'member':entry.filename,'crc32':entry.CRC}
      group['files'].append(item);members+=1
      if item['category']=='Archive':item['coverage_note']='Nested archive indexed as a file; contents not expanded in this catalog.'
   except (OSError,zipfile.BadZipFile,RuntimeError) as e:issue(p,e)
  if n%1000==0:print(f'{n} source files; {members} archive members; {len(projects)} projects; {round(time.time()-started)} seconds',flush=True)
summary=[]
for key,group in projects.items():
 (OUT/(key+'.json')).write_text(json.dumps(group,ensure_ascii=False),encoding='utf-8')
 fs=group['files'];physical=[x for x in fs if x['source']=='file']
 summary.append({'id':key,'name':group['name'],'year':group['year'],'source_files':len(physical),'archive_members':len(fs)-len(physical),'source_bytes':sum(x['bytes'] for x in physical),'ab1_files':sum(x['extension'] in ('.ab1','.abi') for x in physical),'categories':dict(collections.Counter(x['category'] for x in fs))})
result={'source_root':str(DISPLAY_ROOT),'created_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'source_files':n,'archive_members':members,'projects':sorted(summary,key=lambda x:(x['year'],x['name'])),'errors':errors,'coverage':'All accessible physical files recursively indexed. First-level ZIP members indexed without extraction. Nested archives and non-ZIP archives are listed, not expanded. Counts include duplicate copies; no unique-read or assay conclusions.'}
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'source_files':n,'archive_members':members,'projects':len(projects),'errors':len(errors),'seconds':round(time.time()-started),'years':dict(collections.Counter(x['year'] for x in summary))}),flush=True)
