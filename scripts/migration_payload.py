import argparse, base64, gzip, hashlib, pathlib

# Phase 6 retry after splitting the exact payload chunk 5 into two verified pieces.
TARGET = 'index.html'
EXPECTED = 'c4026e999bff73eabe2c8c260fb16758e5b13552d80a438ea11a8cd05144d085'
PARTS = [
    pathlib.Path('scripts/payload_parts/part01.txt'),
    pathlib.Path('scripts/payload_parts/part02.txt'),
    pathlib.Path('scripts/payload_parts/part03.txt'),
    pathlib.Path('scripts/payload_parts/part04.txt'),
    pathlib.Path('scripts/payload_parts/part05a.txt'),
    pathlib.Path('scripts/payload_parts/part05b.txt'),
    pathlib.Path('scripts/payload_parts/part06.txt'),
    pathlib.Path('scripts/payload_parts/part07.txt'),
]

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--print-target', action='store_true')
    args = ap.parse_args()
    if args.print_target:
        print(TARGET)
        raise SystemExit(0)
    payload = ''.join(p.read_text().strip() for p in PARTS)
    data = gzip.decompress(base64.b64decode(payload))
    got = hashlib.sha256(data).hexdigest()
    if got != EXPECTED:
        raise SystemExit(f'hash mismatch: {got} != {EXPECTED}')
    pathlib.Path(TARGET).write_bytes(data)
    print(f'OK {TARGET} {len(data)} bytes {got}')
