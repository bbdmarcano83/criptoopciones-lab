import argparse, base64, gzip, hashlib, pathlib

TARGET = 'index.html'
EXPECTED = 'c4026e999bff73eabe2c8c260fb16758e5b13552d80a438ea11a8cd05144d085'
PARTS = [pathlib.Path(f'scripts/payload_parts/part{i:02d}.txt') for i in range(1, 8)]

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
