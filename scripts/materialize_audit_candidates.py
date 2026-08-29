import base64, gzip, hashlib, pathlib

TARGETS = {
    'manual.html': {
        'expected': '4a06fdb5484797300406b0e5f209d3fa23702a635f4ba1f822995d2e109c7a4b',
        'parts': pathlib.Path('scripts/audit_payload/manual'),
    },
    'index.html': {
        'expected': '02fa39b240e7ca0faa90ce8438cc47c7f6cfd98902ea86ea28f0469ce5222501',
        'parts': pathlib.Path('scripts/audit_payload/index'),
    },
}

for target, cfg in TARGETS.items():
    parts = sorted(cfg['parts'].glob('part*.txt'))
    if not parts:
        raise SystemExit(f'no payload parts for {target}')
    payload = ''.join(''.join(p.read_text().split()) for p in parts)
    data = gzip.decompress(base64.b64decode(payload, validate=True))
    got = hashlib.sha256(data).hexdigest()
    if got != cfg['expected']:
        raise SystemExit(f'{target}: hash mismatch {got} != {cfg["expected"]}')
    pathlib.Path(target).write_bytes(data)
    print(f'OK {target} {len(data)} bytes {got}')
