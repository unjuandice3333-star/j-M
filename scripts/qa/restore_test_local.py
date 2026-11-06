#!/usr/bin/env python3
"""
M30 — Prueba REAL de restauración de la copia lógica de QA en un stack Supabase LOCAL aislado (PostgreSQL 17).

  python3 scripts/qa/restore_test_local.py <dir-de-la-copia> [--db postgresql://postgres:postgres@127.0.0.1:54322/postgres]

1. Reproduce el historial de QA con el SQL guardado en supabase_migrations.schema_migrations (28 versiones), una
   transacción por migración, y registra cada versión en el historial local.
2. Crea la cuenta referenciada por profiles en auth.users (solo el id; correo ficticio, sin contraseña).
3. Carga los datos de public con session_replication_role=replica (sin disparar triggers ni comprobar FK durante la
   carga) y fija las secuencias.
4. Verifica: sumas de control por tabla iguales a las calculadas EN QA (03_checksums_qa.json) y FK válidas.
Solo se conecta a 127.0.0.1. Escribe un informe JSON junto a la copia (restore_report.json).
"""
import json, os, re, subprocess, sys, tempfile, hashlib

args = sys.argv[1:]
if not args:
    sys.exit('uso: restore_test_local.py <dir-copia> [--db URL]')
BK = os.path.abspath(args[0])
DB = args[args.index('--db') + 1] if '--db' in args else 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if '@127.0.0.1:' not in DB and '@localhost:' not in DB:
    sys.exit('solo se restaura en un stack local (127.0.0.1)')

def psql(sql=None, file=None, single=True, quiet=True):
    cmd = ['psql', DB, '-X', '-v', 'ON_ERROR_STOP=1', '-At']
    if single: cmd.append('--single-transaction')
    if quiet: cmd.append('-q')
    cmd += ['-f', file] if file else ['-c', sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()

def load(name):
    with open(os.path.join(BK, name), encoding='utf-8') as f: return json.load(f)

# Integridad de la copia antes de usarla: cada archivo del manifiesto debe tener su SHA-256
manifest = load('MANIFEST.json')
for m in manifest['files']:
    with open(os.path.join(BK, m['file']), 'rb') as f:
        if hashlib.sha256(f.read()).hexdigest() != m['sha256']:
            sys.exit(f"copia alterada: {m['file']}")

report = {'backup': os.path.basename(BK), 'db': 'local 127.0.0.1', 'migrations': [], 'tables': {}, 'fk_violations': None}
tmp = tempfile.mkdtemp(prefix='jm-restore-')

# 1. Historial de migraciones de QA
rc, out, err = psql("select count(*) from pg_namespace where nspname='public' and exists (select 1 from pg_class c where c.relnamespace=pg_namespace.oid and c.relkind='r')")
if out != '0':
    sys.exit('el esquema public local no está vacío: use un stack recién creado')
psql("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)")
for mig in load('01_schema_migrations.json'):
    path = os.path.join(tmp, f"{mig['version']}.sql")
    with open(path, 'w', encoding='utf-8') as f:
        f.write(';\n'.join(s.rstrip().rstrip(';') for s in (mig['statements'] or [])) + ';\n')
    rc, out, err = psql(file=path)
    ok = rc == 0
    if ok:
        with open(path + '.hist.sql', 'w', encoding='utf-8') as f:
            f.write("insert into supabase_migrations.schema_migrations(version, name, statements) values ("
                    f"'{mig['version']}', '{mig['name']}', (select array_agg(x) from json_array_elements_text($j${json.dumps(mig['statements'])}$j$::json) x))")
        psql(file=path + '.hist.sql')
    report['migrations'].append({'version': mig['version'], 'name': mig['name'], 'ok': ok, 'error': None if ok else err.splitlines()[-1][:300]})
    print(f"  migración {mig['version']} {mig['name']}: {'OK' if ok else 'FALLO → ' + err.splitlines()[-1][:160]}")

# 2. Cuenta(s) de auth referenciadas por profiles: solo el id
accounts = load('04_auth_accounts.json') or []
for a in accounts:
    psql(f"insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values "
         f"('00000000-0000-0000-0000-000000000000', '{a['id']}', 'authenticated', 'authenticated', 'restaurado-{a['id'][:8]}@local.invalid', now(), now(), now()) on conflict (id) do nothing")

# 3. Datos. Las migraciones de QA insertan datos de referencia y el alta en auth crea perfiles: se vacían las tablas
#    LOCALES para que el contenido final sea exactamente el de la copia. Orden indiferente con session_replication_role=replica.
checks = load('03_checksums_qa.json')
psql('truncate ' + ', '.join(f'public."{t}"' for t in sorted(checks)) + ' cascade')
for table in sorted(checks):
    src = os.path.join(BK, 'data', f'{table}.ndjson')
    nd = os.path.join(tmp, f'{table}.ndjson')
    with open(src, encoding='utf-8') as fi, open(nd, 'w', encoding='utf-8') as fo:
        for line in fi:   # texto exacto de QA; formato text de COPY: se escapan las barras invertidas
            if line.strip(): fo.write(line.rstrip('\n').replace('\\', '\\\\') + '\n')
    script = os.path.join(tmp, f'{table}.load.sql')
    with open(script, 'w', encoding='utf-8') as f:
        f.write("set session_replication_role = replica;\ncreate temp table _j(doc jsonb);\n"
                f"\\copy _j(doc) from '{nd}'\n"
                f'insert into public."{table}" select r.* from _j, jsonb_populate_record(null::public."{table}", _j.doc) r;\n')
    rc, out, err = psql(file=script)
    report['tables'][table] = {'load_ok': rc == 0, 'error': None if rc == 0 else err.splitlines()[-1][:300]}
for s in load('02_catalog.json').get('sequences') or []:
    if s.get('last_value') is not None:
        psql(f"select setval('public.\"{s['name']}\"', {int(s['last_value'])})")

# 4. Verificación: sumas de control por tabla (mismo cálculo que en QA) y FK
ok_all = True
for table, exp in checks.items():
    rc, out, err = psql(f"select json_build_object('rows', count(*), 'md5', md5(coalesce(string_agg(t::text, E'\\n' order by t::text collate \"C\"), ''))) from public.\"{table}\" t", single=False)
    got = json.loads(out) if rc == 0 and out else {'rows': None, 'md5': None}
    match = got['rows'] == exp['rows'] and got['md5'] == exp['md5']
    report['tables'][table].update({'rows_qa': exp['rows'], 'rows_local': got['rows'], 'checksum_match': match})
    ok_all &= match
# FK: búsqueda de filas huérfanas para cada clave externa (la carga se hizo sin comprobar FK)
violations = []
rc, out, err = psql("""select coalesce(json_agg(x), '[]') from (
  select c.conname, c.conrelid::regclass::text as t from pg_constraint c join pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'public' and c.contype = 'f') x""", single=False)
for fk in json.loads(out or '[]'):
    rc2, defn, _ = psql(f"select pg_get_constraintdef(oid) from pg_constraint where conname = '{fk['conname']}' and conrelid = '{fk['t']}'::regclass", single=False)
    m = re.match(r'FOREIGN KEY \((.+?)\) REFERENCES ([^(]+)\((.+?)\)', defn)
    if not m: continue
    cols = [c.strip() for c in m.group(1).split(',')]; ref = m.group(2).strip(); rcols = [c.strip() for c in m.group(3).split(',')]
    cond = ' and '.join(f'r.{rc_} = t.{c}' for c, rc_ in zip(cols, rcols)); notnull = ' and '.join(f't.{c} is not null' for c in cols)
    rc3, n, _ = psql(f"select count(*) from {fk['t']} t where {notnull} and not exists (select 1 from {ref} r where {cond})", single=False)
    if rc3 == 0 and n != '0': violations.append({'fk': fk['conname'], 'tabla': fk['t'], 'huerfanas': int(n)})
report['fk_violations'] = violations
report['migrations_ok'] = sum(m['ok'] for m in report['migrations'])
report['migrations_total'] = len(report['migrations'])
report['tables_checksum_match'] = sum(1 for t in report['tables'].values() if t.get('checksum_match'))
report['tables_total'] = len(checks)
report['result'] = 'PASS' if ok_all and not violations and report['migrations_ok'] == report['migrations_total'] else 'FAIL'
with open(os.path.join(BK, 'restore_report.json'), 'w', encoding='utf-8') as f: json.dump(report, f, indent=1, ensure_ascii=False)
print(f"migraciones: {report['migrations_ok']}/{report['migrations_total']} · tablas con suma de control idéntica: "
      f"{report['tables_checksum_match']}/{report['tables_total']} · FK huérfanas: {len(violations)} · RESULTADO: {report['result']}")
sys.exit(0 if report['result'] == 'PASS' else 1)
