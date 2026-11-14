#!/usr/bin/env python3
"""M24C — Validación de servicios reales de Supabase local (GoTrue, PostgREST, Storage) vía HTTP.
Solo localhost. Las llaves se leen de `supabase status -o json` y nunca se imprimen."""
import json, os, secrets, sys, time, uuid, urllib.request, urllib.error

st = json.load(open(sys.argv[1]))
API = st["API_URL"]            # http://127.0.0.1:54321
ANON = st["ANON_KEY"]
SERVICE = st["SERVICE_ROLE_KEY"]
assert API.startswith("http://127.0.0.1"), "solo se permite el stack local"

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

def call(method, path, body=None, token=None, apikey=ANON, headers=None, raw=None, ctype="application/json", want_headers=False):
    h = {"apikey": apikey, "Authorization": f"Bearer {token or apikey}"}
    if headers: h.update(headers)
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if data is not None: h["Content-Type"] = ctype
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode() or "null"
            out = (r.status, (json.loads(txt) if txt.strip()[:1] in "[{n\"0123456789-tf" else txt))
            return out + (dict(r.headers),) if want_headers else out
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try: out = (e.code, json.loads(txt))
        except Exception: out = (e.code, txt)
        return out + (dict(e.headers),) if want_headers else out

# M26-R1 (MAJ-4): los usuarios seed no tienen contraseña conocida. Cada ejecución genera una
# contraseña aleatoria (nunca se imprime ni se guarda) y la fija con la API de administración de
# GoTrue usando la llave de servicio LOCAL. No existe contraseña fija versionada.
RUN_PWD = secrets.token_urlsafe(24)
SEED_USERS = {"superadmin": "00000000-0000-4000-8000-00000000a001", "admin": "00000000-0000-4000-8000-00000000a002",
              "cliente1": "00000000-0000-4000-8000-00000000a003", "cliente2": "00000000-0000-4000-8000-00000000a004"}

def login(email, pwd=None):
    s, b = call("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pwd or RUN_PWD})
    return s, (b.get("access_token") if isinstance(b, dict) else None), b

# ---------------- AUTH (GoTrue) ----------------
tokens = {}
s, _, _ = login("cliente1@qa.jm.test")
check("auth: usuario seed sin contraseña conocida (login rechazado antes de fijarla)", s == 400, f"HTTP {s}")
for who, uid in SEED_USERS.items():
    s, _ = call("PUT", f"/auth/v1/admin/users/{uid}", {"password": RUN_PWD}, token=SERVICE, apikey=SERVICE)
    check(f"auth: contraseña por ejecución fijada vía API admin para {who}", s == 200, f"HTTP {s}")
for who in SEED_USERS:
    s, tok, b = login(f"{who}@qa.jm.test")
    tokens[who] = tok
    check(f"auth: login de usuario seed {who}@qa.jm.test con GoTrue real", s == 200 and tok, f"HTTP {s}")
s, tok, _ = login("cliente1@qa.jm.test", "contraseña-incorrecta")
check("auth: contraseña incorrecta rechazada", s == 400 and not tok, f"HTTP {s}")

new_email = f"nuevo.{uuid.uuid4().hex[:8]}@qa.jm.test"
s, b = call("POST", "/auth/v1/signup", {"email": new_email, "password": secrets.token_urlsafe(24), "data": {"full_name": "Registro Nuevo"}})
new_tok = b.get("access_token") if isinstance(b, dict) else None
check("auth: registro público (signup) vía GoTrue", s == 200 and new_tok, f"HTTP {s}")
s, prof = call("GET", "/rest/v1/profiles?select=email,full_name,role", token=new_tok)
check("auth→trigger: perfil creado automáticamente con rol customer, email y nombre",
      s == 200 and prof and prof[0]["role"] == "customer" and prof[0]["email"] == new_email and prof[0]["full_name"] == "Registro Nuevo",
      f"HTTP {s} {prof}")
s, b = call("PATCH", "/rest/v1/profiles?id=not.is.null", {"role": "admin"}, token=new_tok)
check("roles: usuario nuevo no puede autoasignarse admin vía API", s in (401, 403), f"HTTP {s}")
s, b = call("POST", "/rest/v1/rpc/is_admin", {}, token=tokens["admin"])
check("roles: is_admin() verdadero para admin@qa (JWT real)", s == 200 and b is True, f"HTTP {s} {b}")
s, b = call("POST", "/rest/v1/rpc/is_admin", {}, token=tokens["cliente1"])
check("roles: is_admin() falso para cliente1", s == 200 and b is False, f"HTTP {s} {b}")

# ---------------- CATÁLOGO vía PostgREST ----------------
s, b = call("GET", "/rest/v1/products?select=slug,status,product_colors(colors(slug),is_default),product_images(color_id,position)")
check("catálogo: anon ve 6 productos activos con colores e imágenes embebidos", s == 200 and len(b) == 6 and all(p["status"] == "active" for p in b), f"HTTP {s} n={len(b) if isinstance(b,list) else b}")
s, b = call("GET", "/rest/v1/v_variant_availability?select=variant_id,available&limit=500")
check("catálogo: vista de disponibilidad accesible para anon", s == 200 and len(b) > 0, f"HTTP {s} n={len(b) if isinstance(b,list) else b}")
s, b = call("GET", "/rest/v1/inventories?select=id")
check("RLS: anon sin acceso a inventarios vía API", s in (401, 403), f"HTTP {s}")
s, b = call("GET", "/rest/v1/coupons?select=code")
check("RLS: anon no enumera cupones vía API", s in (401, 403), f"HTTP {s}")
s, b = call("GET", "/rest/v1/inventories?select=id", token=tokens["admin"])
check("RLS: admin lee inventarios vía API", s == 200 and len(b) > 0, f"HTTP {s}")

# admin crea un producto por RPC (vía API)
pid = str(uuid.uuid4())
payload = {"p": {"id": pid, "reference": "JM-M24C-001", "slug": "producto-m24c", "name": "Producto Validación M24C",
                 "category": "camisetas", "base_price": 50000,
                 "colors": [{"color": "negro", "images": [{"storage_path": "m24c/negro-1.jpg"}]}],
                 "variants": [{"color": "negro", "size": "M", "initial_stock": 2}]}}
s, b = call("POST", "/rest/v1/rpc/admin_upsert_product", payload, token=tokens["admin"])
check("productos: admin_upsert_product vía PostgREST con JWT de admin", s == 200 and b.get("product_id") == pid, f"HTTP {s}")
s, b = call("POST", "/rest/v1/rpc/admin_upsert_product", payload, token=tokens["cliente1"])
check("productos: cliente recibe 403 en admin_upsert_product", s == 403 and b.get("hint") == "JM_FORBIDDEN", f"HTTP {s} {b.get('hint') if isinstance(b,dict) else b}")
s, b = call("POST", "/rest/v1/rpc/admin_set_product_status", {"p_product_id": pid, "p_status": "active"}, token=tokens["admin"])
check("productos: publicación vía API", s == 200, f"HTTP {s}")

# ---------------- STORAGE ----------------
img = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
s, b = call("POST", "/storage/v1/object/product-images/m24c/negro-1.png", raw=img, token=tokens["admin"], ctype="image/png", headers={"x-upsert": "true"})
check("storage: admin sube imagen al bucket product-images (Storage API real)", s == 200, f"HTTP {s} {b}")
s, b = call("POST", "/storage/v1/object/product-images/m24c/hack.png", raw=img, ctype="image/png")
check("storage: anon no puede subir imágenes", s in (400, 401, 403), f"HTTP {s}")
s, b = call("POST", "/storage/v1/object/product-images/m24c/cliente.png", raw=img, token=tokens["cliente1"], ctype="image/png")
check("storage: cliente no puede subir imágenes", s in (400, 401, 403), f"HTTP {s}")
req = urllib.request.Request(API + "/storage/v1/object/public/product-images/m24c/negro-1.png")
try:
    with urllib.request.urlopen(req, timeout=30) as r: pub = (r.status, r.headers.get("Content-Type"))
except urllib.error.HTTPError as e: pub = (e.code, None)
check("storage: lectura pública de la imagen (bucket público)", pub[0] == 200, f"HTTP {pub}")
s, b = call("POST", "/storage/v1/object/product-images/m24c/doc.pdf", raw=b"%PDF-1.4", token=tokens["admin"], ctype="application/pdf")
check("storage: tipo MIME no permitido (pdf) rechazado por el bucket", s in (400, 415, 422), f"HTTP {s}")

# ---------------- CHECKOUT + PAGOS vía API ----------------
s, v = call("GET", "/rest/v1/variants?select=id,sku&sku=eq.JM-TEE-001-NEGRO-XL")
var_id = v[0]["id"]
key = "m24c-" + uuid.uuid4().hex
chk = "m24c-chk-" + uuid.uuid4().hex
order_req = {"p_customer": {"name": "Comprador M24C", "email": "m24c@qa.jm.test", "phone": "3001112233"},
             "p_shipping": {"department": "Cundinamarca", "city": "Bogotá", "address": "Calle Prueba 1 # 2-3"},
             "p_items": [{"variant_id": var_id, "quantity": 1, "price": 1}],
             "p_coupon_code": None, "p_shipping_method": "standard", "p_idempotency_key": key}
s, q = call("POST", "/rest/v1/rpc/quote_cart", {"p_items": [{"variant_id": var_id, "quantity": 1}]})
check("checkout: quote_cart vía API (anon) = 129.900 + 15.000", s == 200 and q["total"] == 144900, f"HTTP {s} total={q.get('total') if isinstance(q,dict) else q}")
s, o = call("POST", "/rest/v1/rpc/create_order", order_req)
check("checkout: create_order vía API (anon) con precio manipulado → total 144.900", s == 200 and o["total"] == 144900 and o["public_token"], f"HTTP {s}")
s, o2 = call("POST", "/rest/v1/rpc/create_order", order_req)
check("checkout: idempotencia vía API", s == 200 and o2.get("is_duplicate") is True and o2["order_id"] == o["order_id"], f"HTTP {s}")
bad = dict(order_req, p_idempotency_key="m24c-" + uuid.uuid4().hex, p_items=[{"variant_id": var_id, "quantity": 99}])
s, e = call("POST", "/rest/v1/rpc/create_order", bad)
check("contrato de errores: PostgREST devuelve hint JM_* al frontend", s == 400 and e.get("hint") == "JM_INVALID_QUANTITY", f"HTTP {s} hint={e.get('hint') if isinstance(e,dict) else e}")
s, b = call("POST", "/rest/v1/rpc/create_payment_attempt", {"p_order_id": o["order_id"], "p_public_token": o["public_token"]})
check("pagos: anon no puede crear intentos (solo service_role)", s in (401, 403, 404), f"HTTP {s}")
s, att = call("POST", "/rest/v1/rpc/create_payment_attempt", {"p_order_id": o["order_id"], "p_public_token": o["public_token"]},
              token=SERVICE, apikey=SERVICE)
check("pagos: service_role crea intento (simula Vercel /api/wompi/signature)", s == 200 and att["reference"].endswith("-1") and att["amount_in_cents"] == 14490000, f"HTTP {s}")
event = {"event": "transaction.updated", "environment": "test", "sent_at": "2026-11-06T00:00:00Z",
         "data": {"transaction": {"id": "m24c-tx-" + uuid.uuid4().hex[:8], "reference": att["reference"], "status": "APPROVED",
                                  "amount_in_cents": att["amount_in_cents"], "currency": "COP", "payment_method_type": "CARD"}}}
s, r = call("POST", "/rest/v1/rpc/apply_payment_event", {"p_event": event, "p_event_checksum": chk}, token=SERVICE, apikey=SERVICE)
check("webhook simulado: APPROVED aplicado vía API con service_role", s == 200 and r["result"] == "applied" and r["order_status"] == "paid", f"HTTP {s} {r}")
s, r = call("POST", "/rest/v1/rpc/apply_payment_event", {"p_event": event, "p_event_checksum": chk}, token=SERVICE, apikey=SERVICE)
check("webhook simulado: reentrega idéntica → duplicate", s == 200 and r["result"] == "duplicate", f"HTTP {s} {r}")
s, r = call("POST", "/rest/v1/rpc/apply_payment_event", {"p_event": event, "p_event_checksum": "m24c-chk-x"}, token=tokens["admin"])
check("webhook: ni un admin puede invocar apply_payment_event", s in (401, 403, 404), f"HTTP {s}")
s, pub = call("POST", "/rest/v1/rpc/get_order_public", {"p_order_number": o["order_number"], "p_public_token": o["public_token"]})
check("confirmación: get_order_public (anon + token) muestra 'Pago confirmado'", s == 200 and pub["status"] == "paid" and pub["status_label"] == "Pago confirmado", f"HTTP {s}")
s, b = call("GET", "/rest/v1/online_orders?select=order_number")
check("RLS: anon no lee pedidos vía API", s in (401, 403), f"HTTP {s}")
s, b = call("GET", "/rest/v1/online_orders?select=order_number", token=tokens["cliente1"])
check("RLS: cliente1 ve solo sus 3 pedidos vía API", s == 200 and len(b) == 3, f"HTTP {s} n={len(b) if isinstance(b,list) else b}")
s, b = call("PATCH", "/rest/v1/payment_transactions?id=not.is.null", {"status": "APPROVED"}, token=tokens["cliente1"])
check("RLS: cliente no modifica pagos vía API", s in (401, 403), f"HTTP {s}")

# ---------------- TRANSICIONES + CANCELACIÓN vía API ----------------
s, b = call("POST", "/rest/v1/rpc/admin_transition_order", {"p_order_id": o["order_id"], "p_to": "processing"}, token=tokens["admin"])
check("transiciones: paid → processing (admin, vía API)", s == 200, f"HTTP {s}")
s, b = call("POST", "/rest/v1/rpc/admin_transition_order", {"p_order_id": o["order_id"], "p_to": "delivered"}, token=tokens["admin"])
check("transiciones: processing → delivered rechazada con JM_INVALID_TRANSITION", s == 400 and b.get("hint") == "JM_INVALID_TRANSITION", f"HTTP {s}")
s, b = call("POST", "/rest/v1/rpc/admin_transition_order", {"p_order_id": o["order_id"], "p_to": "cancelled", "p_note": "Validación M24C"}, token=tokens["admin"])
check("cancelación: processing → cancelled con nota (reingreso de stock)", s == 200 and b.get("lines_restocked") == 1, f"HTTP {s} {b}")

# ---------------- DEVOLUCIONES PENDIENTES EN WOMPI (ejecución 133) ----------------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # python -I no añade la carpeta del script
import refund_filter_checks
refund_filter_checks.run(call, check, {**tokens, "service": SERVICE})

json.dump({"passed": sum(1 for r in results if r[1]), "total": len(results),
           "results": [{"check": n, "ok": ok, "detail": d} for n, ok, d in results]},
          open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print(f"\n{sum(1 for r in results if r[1])}/{len(results)} PASS")
sys.exit(0 if all(r[1] for r in results) else 1)
