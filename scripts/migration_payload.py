import argparse, base64, gzip, hashlib, pathlib

# Phase 7: reconstruct the reviewed institutional positions.html candidate.
# This is intentionally NOT the untouched ZIP source: it contains the role-aware
# roll-model fix while preserving the rest of the institutional page.
TARGET = 'positions.html'
EXPECTED = '381feb74ff16b4ff43cd906ccbc4e4311a524a5956e4ff054d671f591b4f0ffb'
PARTS = [
    pathlib.Path('scripts/positions_payload/part01.txt'),
    pathlib.Path('scripts/positions_payload/part02.txt'),
    pathlib.Path('scripts/positions_payload/part03.txt'),
    pathlib.Path('scripts/positions_payload/part04a.txt'),
    pathlib.Path('scripts/positions_payload/part04b.txt'),
    pathlib.Path('scripts/positions_payload/part04c.txt'),
    pathlib.Path('scripts/positions_payload/part05.txt'),
    pathlib.Path('scripts/positions_payload/part06.txt'),
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
        clean = ''.join(p.read_text().split())
        # First staging write accidentally contained an extra 7500-char transport
        # fragment. Keep only the verified first half; final SHA-256 is authoritative.
        if p.name == 'part01.txt' and len(clean) == 15000:
            clean = clean[:7500]
        clean_parts.append(clean)

    payload = ''.join(clean_parts)
    if len(payload) % 4:
        raise SystemExit(f'payload length is not base64-aligned: {len(payload)}')

    data = gzip.decompress(base64.b64decode(payload, validate=True))
    got = hashlib.sha256(data).hexdigest()
    if got != EXPECTED:
        raise SystemExit(f'hash mismatch: {got} != {EXPECTED}')

    text = data.decode('utf-8')
    if '/positions/${p.label}/resize' not in text:
        raise SystemExit('safety check failed: partial resize endpoint missing')
    if "const tipo=sells.some(l=>l.is_call)?'call':'call';" in text:
        raise SystemExit('safety check failed: old roll type bug still present')
    if "modelPair(callPair,'call'" not in text or "modelPair(putPair,'put'" not in text:
        raise SystemExit('safety check failed: role-aware roll model missing')

    pathlib.Path(TARGET).write_bytes(data)
    print(f'OK {TARGET} {len(data)} bytes {got}')
