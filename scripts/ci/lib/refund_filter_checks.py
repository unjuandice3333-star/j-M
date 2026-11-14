"""Ejecución 133 — Devoluciones pendientes en Wompi contra PostgREST REAL (no el backend sintético).

Comprueba, con JWT reales y RLS real:
  * el filtro de `/admin/pedidos?devolucion=pendiente` (embebido aparte `pending_refunds:order_refunds!inner(id)` +
    `pending_refunds.status=eq.requested`) con el MISMO `ORDER_SELECT` de `AdminOrdersPage.jsx` (leído del archivo,
    sin copia), conteo exacto (`Content-Range`) y combinado con el filtro de estado;
  * que el embebido completo `order_refunds` del detalle NO queda recortado por el filtro;
  * la lectura de la campana / dashboard (`order_refunds?status=eq.requested`) para el admin y su aislamiento por RLS
    para clientes y anon;
  * `admin_mark_refund_processed` vía API: el pedido sale del filtro.

Lo usan `http_checks.py` (job `db-supabase`: GoTrue + PostgREST oficiales) y `supabase/tests/postgrest_local.sh`
(PostgreSQL 16 + contenedor PostgREST). `call(method, path, body=None, token=None, headers=None)` debe devolver
(status, cuerpo) o, con `want_headers=True`, (status, cuerpo, cabeceras).
"""
import os, re, secrets

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
PAGE = os.path.join(ROOT, "apps", "web", "src", "pages", "admin", "AdminOrdersPage.jsx")
CUSTOMERS = {"cliente1": "00000000-0000-4000-8000-00000000a003", "cliente2": "00000000-0000-4000-8000-00000000a004"}


def order_select():
    src = open(PAGE, encoding="utf-8").read()
    m = re.search(r"const ORDER_SELECT = `([^`]+)`", src)
    assert m, "ORDER_SELECT no encontrado en AdminOrdersPage.jsx"
    assert "pending_refunds:order_refunds!inner ( id )" in src and "eq('pending_refunds.status', 'requested')" in src, \
        "AdminOrdersPage.jsx ya no usa el filtro que validan estas pruebas: actualizar refund_filter_checks.py"
    return re.sub(r"\s+", "", m.group(1))


def run(call, check, tokens):
    """tokens: {'admin': jwt, 'cliente1': jwt, 'cliente2': jwt}."""
    sel = order_select()
    filt = f"{sel},pending_refunds:order_refunds!inner(id)"
    base = f"/rest/v1/online_orders?select={filt}&pending_refunds.status=eq.requested&order=created_at.desc,id.desc"
    page = {"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-24"}
    ref_q = "/rest/v1/order_refunds?select=id,order_id,amount,status&status=eq.requested&order=created_at.asc,id.asc"

    def pending_ids(tok):
        s, b = call("GET", ref_q, token=tok)
        return s, ({r["order_id"] for r in b} if s == 200 and isinstance(b, list) else None), b

    s, want, refunds = pending_ids(tokens["admin"])
    check("devoluciones: campana/dashboard — admin lee order_refunds pendientes (200, ≥ 1 del seed)",
          s == 200 and want and all(r["status"] == "requested" and int(r["amount"]) > 0 for r in refunds),
          f"HTTP {s} n={len(refunds) if isinstance(refunds, list) else refunds}")

    s, b, h = call("GET", base, token=tokens["admin"], headers=page, want_headers=True)
    got = {o["id"] for o in b} if s in (200, 206) and isinstance(b, list) else None
    total = (h.get("Content-Range") or h.get("content-range") or "").split("/")[-1]
    check("devoluciones: filtro !inner con el ORDER_SELECT real de AdminOrdersPage (admin, 200)",
          s in (200, 206) and got is not None, f"HTTP {s} {b if got is None else ''}")
    check("devoluciones: el filtro devuelve exactamente los pedidos con devolución pendiente",
          got == want, f"filtro={len(got or [])} esperados={len(want or [])}")
    check("devoluciones: conteo exacto (Content-Range) igual al número de pedidos con devolución pendiente",
          want is not None and total == str(len(want)), f"Content-Range total={total!r}")
    check("devoluciones: el detalle conserva el embebido completo order_refunds (no recortado por el filtro)",
          got is not None and all(o.get("order_refunds") and any(r["status"] == "requested" for r in o["order_refunds"])
                                  and o.get("online_order_items") and isinstance(o.get("pending_refunds"), list) for o in b))

    # Ejecución 135 (D109): seed O9 — devolución hecha + devolución pendiente de un pago tardío en el MISMO pedido.
    mixed = [o for o in (b if got is not None else [])
             if {r["status"] for r in o.get("order_refunds") or []} >= {"processed", "requested"}]
    check("devoluciones: pedido con una devolución hecha y otra pendiente aparece en el filtro con ambas",
          len(mixed) >= 1, f"pedidos mixtos={len(mixed)}")
    txs = {t["id"]: t for o in mixed for t in o.get("payment_transactions") or []}
    check("devoluciones: la pendiente del pago tardío apunta a su intento marcado requires_refund (sin reingreso)",
          bool(mixed) and all(any(r["status"] == "requested" and not r["restock"]
                                  and txs.get(r.get("payment_transaction_id"), {}).get("requires_refund") is True
                                  for r in o["order_refunds"]) for o in mixed))

    s, b = call("GET", base + "&status=eq.cancelled", token=tokens["admin"])
    check("devoluciones: combinado con el filtro de estado (cancelados) solo trae cancelados con devolución pendiente",
          s == 200 and isinstance(b, list) and b and all(o["status"] == "cancelled" for o in b)
          and {o["id"] for o in b} <= (want or set()), f"HTTP {s} n={len(b) if isinstance(b, list) else b}")

    # RLS: cada cliente solo ve sus pedidos/devoluciones; anon nada.
    for who, uid in CUSTOMERS.items():
        s, b = call("GET", base, token=tokens[who])
        s2, ids, _ = pending_ids(tokens[who])
        check(f"devoluciones: RLS — {who} solo obtiene pedidos propios con el filtro y solo sus devoluciones",
              s == 200 and isinstance(b, list) and all(o["user_id"] == uid for o in b) and s2 == 200
              and ids == {o["id"] for o in b}, f"HTTP {s}/{s2} pedidos={len(b) if isinstance(b, list) else b}")
    s, b = call("GET", ref_q)
    check("devoluciones: RLS — anon no lee order_refunds", s in (401, 403) or (s == 200 and b == []), f"HTTP {s}")

    # Marcar como hecha en Wompi (RPC real con JWT de admin): el pedido sale del filtro y conserva la devolución.
    target = sorted(refunds, key=lambda r: r["id"])[0] if want else None
    if target is None:
        check("devoluciones: hay una devolución pendiente para marcar", False)
        return
    s, b = call("POST", "/rest/v1/rpc/admin_mark_refund_processed",
                {"p_refund_id": target["id"], "p_provider_refund_id": "qa-refund-" + secrets.token_hex(6)}, token=tokens["cliente1"])
    check("devoluciones: un cliente no puede marcar una devolución como hecha", s in (401, 403), f"HTTP {s}")
    s, b = call("POST", "/rest/v1/rpc/admin_mark_refund_processed",
                {"p_refund_id": target["id"], "p_provider_refund_id": "qa-refund-" + secrets.token_hex(6)}, token=tokens["admin"])
    check("devoluciones: admin_mark_refund_processed vía API (admin)", s == 200 and isinstance(b, dict) and b.get("status") == "processed",
          f"HTTP {s} {b}")
    still = any(r["order_id"] == target["order_id"] and r["id"] != target["id"] for r in refunds)
    s, b = call("GET", base, token=tokens["admin"])
    after = {o["id"] for o in b} if s == 200 and isinstance(b, list) else None
    check("devoluciones: tras marcarla, el pedido sale del filtro (salvo otra devolución pendiente)",
          after is not None and (target["order_id"] in after) == still and after <= want, f"HTTP {s}")
    s, b = call("GET", f"/rest/v1/online_orders?select={sel}&id=eq.{target['order_id']}", token=tokens["admin"])
    check("devoluciones: el detalle sin filtro muestra la devolución procesada con su id de Wompi",
          s == 200 and isinstance(b, list) and len(b) == 1
          and any(r["id"] == target["id"] and r["status"] == "processed" and r["provider_refund_id"] for r in b[0]["order_refunds"]),
          f"HTTP {s}")
