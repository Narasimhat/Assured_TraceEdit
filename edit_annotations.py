"""Select windows by coverage, without guessing which donor edit is functional."""
def select_centers(variants, cuts, flank=10, requested=None, target=None):
    centers=list(dict.fromkeys(requested or []))
    positions=sorted({v['position'] for v in variants})
    if target and target['position'] not in positions:
        raise ValueError('The intended mutation must match a specified SNP or mapped donor change.')
    if not centers and target:
        centers.append(target['position'])
    remaining=[p for p in positions if not any(abs(p-c)<=flank for c in centers)]
    while remaining:
        group=[p for p in remaining if p<=remaining[0]+2*flank]
        centers.append((group[0]+group[-1])//2)
        remaining=[p for p in remaining if not any(abs(p-c)<=flank for c in centers)]
    if len(centers)>6:
        raise ValueError('These requested windows plus specified SNPs need more than six panels. Clear the manual figure centers or increase the flank.')
    return centers or list(cuts[:2])

def target_from_settings(config):
    target=config.get('target_variant')
    if target is None:return None
    if not isinstance(target,dict) or set(target)!={'position','ref','alt','label'}:
        raise ValueError('Invalid intended-mutation annotation.')
    if not isinstance(target['label'],str) or len(target['label'])>35:
        raise ValueError('Use an intended-mutation label of at most 35 characters.')
    if not any(all(v.get(k)==target[k] for k in ('position','ref','alt')) for v in config.get('variants',[])):
        raise ValueError('The intended mutation must match a specified SNP or mapped donor change.')
    return target
