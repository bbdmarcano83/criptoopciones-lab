import argparse, base64, gzip, hashlib, pathlib

# Phase 6 diagnostics: validate every payload piece before materializing index.html.
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

    clean_parts = []
    for p in PARTS:
        raw = p.read_text()
        clean = ''.join(raw.split())
        print(f'PART {p.name} raw={len(raw)} clean={len(clean)} sha256={hashlib.sha256(clean.encode()).hexdigest()}')
        clean_parts.append(clean)

    payload = ''.join(clean_parts)
    print(f'PAYLOAD clean_len={len(payload)} mod4={len(payload) % 4}')
    if len(payload) % 4:
        raise SystemExit('payload length is not base64-aligned')

    data = gzip.decompress(base64.b64decode(payload, validate=True))
    got = hashlib.sha256(data).hexdigest()
    if got != EXPECTED:
        raise SystemExit(f'hash mismatch: {got} != {EXPECTED}')
    pathlib.Path(TARGET).write_bytes(data)
    print(f'OK {TARGET} {len(data)} bytes {got}')
