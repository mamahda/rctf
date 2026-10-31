#!/usr/bin/env python3
"""Provision individually invited participants from a private team manifest.

Run on the rCTF host after applying the participant_accounts migration.
The existing team manifest must contain team, members (nrp/name), and token.
"""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--team-manifest', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()

def psql(query):
    return subprocess.run(
        ['docker', 'exec', '-i', 'rctf-postgres-1', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'rctf', '-d', 'rctf', '-At'],
        input=query, text=True, capture_output=True, check=True,
    ).stdout

def quote(value):
    return "'" + value.replace("'", "''") + "'"

def write_secret(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())

manifest = json.loads(args.team_manifest.read_text(encoding='utf-8'))
rows = csv.reader(io.StringIO(psql("COPY (SELECT id, name::text FROM users WHERE perms=0 AND NOT banned) TO STDOUT WITH CSV;")))
team_ids = {name: uid for uid, name in rows}
if args.out.exists():
    raise SystemExit('Output directory already exists; refusing to overwrite')
seen = set()
prepared = []
for team in manifest:
    name = team['team']
    if name not in team_ids:
        raise SystemExit('Team not found or is privileged: ' + name)
    for member in team['members']:
        nrp, person = member['nrp'], member['name']
        if not re.fullmatch(r'\d{10}', nrp) or nrp in seen or not person:
            raise SystemExit('Invalid or duplicate roster entry')
        seen.add(nrp)
        prepared.append({'nrp': nrp, 'name': person, 'team': name, 'team_id': team_ids[name], 'invitation_code': secrets.token_urlsafe(24), 'team_code': team['token']})
if not prepared:
    raise SystemExit('Roster is empty')
existing = set(psql('SELECT nrp FROM participant_accounts;').splitlines())
if existing.intersection(seen):
    raise SystemExit('Some NRPs already exist; no new accounts were created')
args.out.mkdir(mode=0o700)
os.chmod(args.out, 0o700)
for player in prepared:
    content = '\n'.join([
        'QUADRATHLON CTF — AKUN PESERTA',
        'Nama: ' + player['name'], 'NRP: ' + player['nrp'], 'Tim: ' + player['team'], '',
        '1. Buka http://10.28.78.199/register dan masukkan NRP serta kode pendaftaran pribadi:',
        player['invitation_code'],
        '2. Buat password khusus kompetisi (minimal 12 karakter), lalu login.',
        '3. Masukkan kode tim berikut untuk bergabung:', player['team_code'], '',
        'Kode pendaftaran hanya dapat digunakan sekali. Jangan bagikan kode atau password.',
        'Jika kehilangan akses, hubungi panitia.', '',
    ])
    write_secret(args.out / (player['nrp'] + '.txt'), content)
write_secret(args.out / 'panitia-semua-peserta.json', json.dumps(prepared, ensure_ascii=False, indent=2) + '\n')
values = []
for player in prepared:
    digest = hashlib.sha256(player['invitation_code'].encode()).hexdigest()
    values.append('(' + ','.join(map(quote, [player['nrp'], player['name'], player['team_id'], digest])) + ')')
try:
    psql('BEGIN; INSERT INTO participant_accounts (nrp,name,assigned_team_id,invite_hash) VALUES ' + ','.join(values) + '; COMMIT;')
except subprocess.CalledProcessError as exc:
    raise SystemExit('Provisioning failed; no rows committed. Protected files remain at ' + str(args.out)) from exc
print(f'Provisioned {len(prepared)} invited participants across {len(manifest)} teams; protected files: {args.out}')
