from __future__ import annotations
import argparse, csv, hashlib, io, re, zipfile
from pathlib import Path, PurePosixPath

MAX_DEPTH = 4
MAX_AB1_SIZE = 2_000_000
MAX_TOTAL_AB1 = 1_000_000_000
MAX_ENTRIES = 100_000

def safe_parts(name: str) -> tuple[str, ...]:
    p = PurePosixPath(name.replace('\\', '/'))
    parts = tuple(re.sub(r'[^A-Za-z0-9._ -]', '_', x) for x in p.parts if x not in ('', '.', '..', '/'))
    return parts or ('unnamed.ab1',)

def extract(archive: zipfile.ZipFile, output: Path, prefix: tuple[str, ...], depth: int, state: dict, rows: list[dict]) -> None:
    if depth > MAX_DEPTH:
        return
    for info in archive.infolist():
        state['entries'] += 1
        if state['entries'] > MAX_ENTRIES:
            raise RuntimeError(f'Archive exceeds {MAX_ENTRIES:,} entries; stopped safely.')
        if info.is_dir():
            continue
        parts = safe_parts(info.filename)
        name = parts[-1]
        try:
            if name.lower().endswith('.zip'):
                if depth == MAX_DEPTH:
                    continue
                nested = archive.read(info)
                try:
                    with zipfile.ZipFile(io.BytesIO(nested)) as child:
                        extract(child, output, prefix + parts[:-1] + (name[:-4],), depth + 1, state, rows)
                except zipfile.BadZipFile:
                    state['bad_nested'] += 1
                continue
            if not name.lower().endswith(('.ab1', '.abi')):
                continue
            if info.file_size > MAX_AB1_SIZE:
                state['oversize'] += 1
                continue
            if state['bytes'] + info.file_size > MAX_TOTAL_AB1:
                raise RuntimeError(f'AB1 extraction would exceed {MAX_TOTAL_AB1:,} bytes; stopped safely.')
            data = archive.read(info)
            if not data.startswith(b'ABIF'):
                continue
            rel = Path(*prefix, *parts)
            dest = output / rel
            if len(str(dest)) > 220:
                digest = hashlib.sha256(str(rel).encode('utf-8')).hexdigest()[:12]
                dest = output / '_longpaths' / f'{digest}_{name}'
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                stem, suffix = dest.stem, dest.suffix
                i = 2
                while dest.exists():
                    dest = dest.with_name(f'{stem}_{i}{suffix}'); i += 1
            dest.write_bytes(data)
            state['bytes'] += len(data)
            rows.append({'file': str(dest.relative_to(output)), 'bytes': len(data), 'archive_member': '/'.join(prefix + parts)})
        except (OSError, zipfile.BadZipFile, RuntimeError):
            raise
        except Exception as exc:
            state['errors'] += 1
            print(f'Skipped {info.filename}: {exc}')

def main() -> None:
    parser = argparse.ArgumentParser(description='Extract AB1 reads only from a ZIP archive and nested ZIPs.')
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    state = {'entries': 0, 'bytes': 0, 'oversize': 0, 'errors': 0, 'bad_nested': 0}
    rows: list[dict] = []
    with zipfile.ZipFile(args.archive) as z:
        extract(z, args.output, (), 0, state, rows)
    manifest = args.output / 'ab1_manifest.csv'
    with manifest.open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=['file', 'bytes', 'archive_member']); w.writeheader(); w.writerows(rows)
    print(f'Extracted {len(rows)} AB1 files ({state["bytes"]:,} bytes) into {args.output.resolve()}')
    print(f'Archive entries inspected: {state["entries"]:,}; skipped oversized AB1: {state["oversize"]}; unreadable nested ZIPs: {state["bad_nested"]}; manifest: {manifest.resolve()}')

if __name__ == '__main__': main()
