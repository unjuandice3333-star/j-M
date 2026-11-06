#!/usr/bin/env python3
"""H1 — Aislar qué columnas NULL de auth.users rompen el login en GoTrue real (solo stack local)."""
import json, subprocess, sys, urllib.request, urllib.error
st = json.load(open(sys.argv[1])); API = st["API_URL"]; ANON = st["ANON_KEY"]
assert API.startswith("http://127.0.0.1")
DB = "supabase_db_jm-fashion-store"
COLS = ["confirmation_token", "recovery_token", "email_change_token_new", "email_change",
        "email_change_token_current", "reauthentication_token", "phone_change", "phone_change_token"]
EMAIL = "cliente1@qa.jm.test"

def sql(q):
    return subprocess.run(["docker", "exec", "-i", DB, "psql", "-U", "supabase_admin", "-d", "postgres", "-At", "-c", q],
                          capture_output=True, text=True, check=True).stdout.strip()

def login():
    req = urllib.request.Request(API + "/auth/v1/token?grant_type=password",
        data=json.dumps({"email": EMAIL, "password": "QaLocal-2026!"}).encode(), method="POST",
        headers={"apikey": ANON, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

print("Estado sembrado:", sql(f"SELECT " + ", ".join(f"'{c}='||coalesce({c},'<NULL>')" for c in COLS) + f" FROM auth.users WHERE email='{EMAIL}'"))
print("Login con el seed tal cual:", login())
base = ", ".join(f"{c} = ''" for c in COLS)
sql(f"UPDATE auth.users SET {base} WHERE email = '{EMAIL}'")
print("Login con todas en '':", login())
for c in COLS:
    sql(f"UPDATE auth.users SET {base} WHERE email = '{EMAIL}'")
    sql(f"UPDATE auth.users SET {c} = NULL WHERE email = '{EMAIL}'")
    print(f"  solo {c} = NULL -> HTTP {login()}")
sql(f"UPDATE auth.users SET {base} WHERE email = '{EMAIL}'")
