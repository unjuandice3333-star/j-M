#!/usr/bin/env python3
"""Ejecución 133 — cliente HTTP mínimo para postgrest_local.sh. Firma JWT HS256 (rol `authenticated`, `sub` de los
usuarios del seed) con el secreto de la ejecución (env JM_JWT_SECRET, nunca impreso) y corre refund_filter_checks."""
import base64, hashlib, hmac, json, os, sys, time, urllib.error, urllib.request

API = sys.argv[1]
assert API.startswith("http://127.0.0.1"), "solo loopback"
SECRET = os.environ.pop("JM_JWT_SECRET").encode()
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "ci", "lib"))
import refund_filter_checks  # noqa: E402

b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def jwt(sub, role="authenticated"):
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": sub, "role": role, "aud": "authenticated", "exp": int(time.time()) + 3600}).encode())
    sig = b64(hmac.new(SECRET, f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"

def call(method, path, body=None, token=None, headers=None, want_headers=False):
    path = path.replace("/rest/v1", "", 1)
    h = dict(headers or {})
    if token: h["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    if data is not None: h["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = (r.status, json.loads(r.read().decode() or "null"), dict(r.headers))
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try: out = (e.code, json.loads(txt), dict(e.headers))
        except Exception: out = (e.code, txt, dict(e.headers))
    return out if want_headers else out[:2]

results = []
def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

tokens = {"admin": jwt("00000000-0000-4000-8000-00000000a002"),
          "service": jwt("00000000-0000-4000-8000-00000000a002", role="service_role"),
          **{k: jwt(v) for k, v in refund_filter_checks.CUSTOMERS.items()}}
s, b = call("POST", "/rest/v1/rpc/is_admin", {}, token=tokens["admin"])
check("JWT local: is_admin() verdadero para admin@qa", s == 200 and b is True, f"HTTP {s} {b}")
refund_filter_checks.run(call, check, tokens)
print(f"\n{sum(results)}/{len(results)} PASS")
sys.exit(0 if all(results) else 1)
