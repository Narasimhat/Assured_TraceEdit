"""Continuous AB1 display windows; inference is independent."""
import numpy as np
COLORS = ['#16a05a','#2568bc','#252525','#e23b37']
def trace_window(trace,center,flank,offset=0):
    """Map all instrument scans to fractional control base positions, preserving amplitudes."""
    if trace.raw_signal is None or trace.peak_positions is None: raise ValueError('Continuous trace data unavailable.')
    lo,hi=int(center-flank),int(center+flank)
    first,last=lo-1+offset,hi-1+offset
    if first<1 or last>=len(trace.sequence)-1: raise ValueError('Requested window exceeds trace coverage.')
    indices=np.arange(first-1,last+2)
    peaks=trace.peak_positions[indices]
    if np.any(np.diff(peaks)<=0): raise ValueError('Repeated base positions in this window prevent a reliable display alignment.')
    scans=np.arange(int(peaks[0]),int(peaks[-1])+1)
    x=np.interp(scans,peaks,indices+1-offset)
    keep=(x>=lo-.5)&(x<=hi+.5)
    values=trace.raw_signal[scans[keep]]
    # One factor across all four dyes and all scans. No clipping, smoothing or per-base normalization.
    factor=float(np.max(np.abs(values)))
    if factor<=0: raise ValueError('No signal in requested trace window.')
    values=values/factor
    return {'x':x[keep].round(5).tolist(),'y':values.round(6).tolist(),
            'positions':list(range(lo,hi+1)),'calls':trace.sequence[first:last+1],
            'quality':trace.quality[first:last+1].tolist(),'scale_divisor':factor,
            'center_quality':int(trace.quality[int(center)-1+offset]),
            'source':trace.name,'hash':trace.sha256,'start':lo,'end':hi,
            'scale_method':'One maximum-absolute-amplitude factor for all four channels in this displayed window.'}
