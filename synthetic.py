"""Deterministic synthetic ABIF fixtures; no biological or project data."""
import struct
import numpy as np

def ab1(sequence,signal):
    peaks=np.arange(len(sequence))*12+15
    scans=np.arange(int(peaks[-1]+20))
    raw=np.zeros((len(scans),4))
    for i,p in enumerate(peaks):
        raw+=np.exp(-.5*((scans-p)/2.1)**2)[:,None]*signal[i]*1500
    entries=[]
    def add(tag,num,kind,size,count,payload): entries.append((tag.encode(),num,kind,size,count,payload))
    add('FWO_',1,2,1,4,b'ACGT')
    add('PBAS',2,2,1,len(sequence),sequence.encode())
    add('PCON',2,2,1,len(sequence),bytes([40])*len(sequence))
    add('PLOC',2,4,2,len(sequence),peaks.astype('>i2').tobytes())
    for i in range(4): add('DATA',9+i,4,2,len(scans),raw[:,i].round().astype('>i2').tobytes())
    directory=bytearray();data=bytearray();offset=34+28*len(entries)
    for tag,num,kind,size,count,payload in entries:
        pointer=int.from_bytes(payload.ljust(4,b'\0'),'big') if len(payload)<=4 else offset+len(data)
        directory+=struct.pack('>4sIHHIIII',tag,num,kind,size,count,len(payload),pointer,0)
        if len(payload)>4:data+=payload
    root=struct.pack('>4sIHHIIII',b'tdir',1,1023,28,len(entries),28*len(entries),34,0)
    return b'ABIF'+struct.pack('>H',101)+root+directory+data

def example():
    rng=np.random.default_rng(177)
    seq=''.join(rng.choice(list('ACGT'),650))
    control=np.eye(4)[['ACGT'.index(b) for b in seq]]
    alt=next(b for b in 'ACGT' if b!=seq[246])
    mixed=control.copy();mixed[246]=.45*control[246]+.55*np.eye(4)['ACGT'.index(alt)]
    calls=''.join('ACGT'[i] for i in mixed.argmax(axis=1))
    return ab1(seq,control),ab1(calls,mixed),{'cut_positions':[240],'variants':[{'position':247,'ref':seq[246],'alt':alt}],'max_deletion':8,'flank':10}

if __name__=='__main__':
    from pathlib import Path
    import json
    out=Path('tmp/synthetic');out.mkdir(parents=True,exist_ok=True)
    c,s,settings=example()
    (out/'synthetic_control.ab1').write_bytes(c)
    (out/'synthetic_mixed.ab1').write_bytes(s)
    (out/'settings.json').write_text(json.dumps(settings,indent=2))
    print('Generated two synthetic traces in tmp/synthetic; expected alternate signal approximately 55%.')
