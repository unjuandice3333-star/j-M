// =============================================================================
// Boletín «Únete al club J&M» — suscriptores (ejecución 69).
// Lee newsletter_subscribers completo (fetchAllRows), busca, da de baja/reactiva y exporta CSV.
// RLS: solo is_admin() lee y solo puede cambiar unsubscribed_at.
// =============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Search } from '../../components/Common/icons';
import { fetchNewsletterSubscribers, setNewsletterSubscriberActive } from '../../services/newsletterService';
import { downloadCsv, filterSubscribers, isActiveSubscriber, subscriberStatusFromParam, subscribersToCsv, summarizeSubscribers } from '../../utils/newsletterAdmin';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('es-CO') : '—');

export const AdminNewsletterPage = () => {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Búsqueda y estado en la URL (`?q=`, `?estado=`) para compartir o recargar la vista (ejecución 84).
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const status = subscriberStatusFromParam(searchParams.get('estado'));
  const setParam = (key, value, empty) => {
    const next = new URLSearchParams(searchParams);
    if (value === empty) next.delete(key); else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const setQuery = (value) => setParam('q', value, '');
  const setStatus = (value) => setParam('estado', value, 'activos');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { rows: data, capped } = await fetchNewsletterSubscribers();
        setRows(data);
        if (capped) setLoadError('Hay más suscriptores de los que el panel puede cargar; la lista puede estar incompleta.');
      } catch (e) {
        setLoadError(e.message);
      }
      setIsLoading(false);
    })();
  }, []);

  const summary = useMemo(() => summarizeSubscribers(rows), [rows]);
  const filtered = useMemo(() => filterSubscribers(rows, query, status), [rows, query, status]);

  const toggle = async (s) => {
    const activate = !isActiveSubscriber(s);
    if (!activate && !window.confirm(`¿Dar de baja a ${s.email}? No recibirá más correos del boletín.`)) return;
    setBusyId(s.id); setNotice(null);
    try {
      const updated = await setNewsletterSubscriberActive(s.id, activate);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setNotice({ ok: true, text: activate ? `${s.email} reactivado.` : `${s.email} dado de baja.` });
    } catch (e) {
      setNotice({ ok: false, text: e.message });
    }
    setBusyId(null);
  };

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`suscriptores-boletin-${status}-${stamp}.csv`, subscribersToCsv(filtered));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#09090B', textTransform: 'uppercase' }}>BOLETÍN ({summary.active})</h1>
        <p style={{ fontSize: '0.88rem', color: '#71717A' }}>
          Suscriptores del club J&M: {summary.active} activos · {summary.unsubscribed} dados de baja · {summary.total} en total.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#FFF', padding: '1rem', borderRadius: '10px', border: '1px solid #E4E4E7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #D4D4D8', borderRadius: '6px', padding: '0.5rem 0.8rem', flex: 1, minWidth: 220 }}>
          <Search size={16} color="#71717A" />
          <input aria-label="Buscar suscriptores" placeholder="Buscar por correo u origen" value={query} onChange={(e) => setQuery(e.target.value)} style={{ border: 'none', outline: 'none', flex: 1, minHeight: 36 }} />
        </div>
        <select aria-label="Filtrar por estado" value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '0.55rem', border: '1px solid #D4D4D8', borderRadius: '6px' }}>
          <option value="activos">Activos</option>
          <option value="bajas">Dados de baja</option>
          <option value="todos">Todos</option>
        </select>
        <button type="button" onClick={exportCsv} disabled={isLoading || filtered.length === 0}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: '6px', backgroundColor: '#09090B', color: '#FFF', fontWeight: 700, opacity: isLoading || filtered.length === 0 ? 0.5 : 1 }}>
          <Download size={16} /> Exportar CSV ({filtered.length})
        </button>
      </div>
      {loadError && <div role="alert" style={{ color: '#B91C1C', fontWeight: 600 }}>{loadError}</div>}
      {notice && <div role={notice.ok ? 'status' : 'alert'} style={{ color: notice.ok ? '#15803D' : '#B91C1C', fontWeight: 600 }}>{notice.text}</div>}

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E4E4E7', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #E4E4E7', textAlign: 'left' }}>
              {['CORREO', 'ESTADO', 'ORIGEN', 'SUSCRITO', 'BAJA', ''].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} style={td}>Cargando…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={6} style={{ ...td, color: '#71717A' }}>No hay suscriptores con este filtro.</td></tr>}
            {filtered.map((s) => {
              const active = isActiveSubscriber(s);
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #F4F4F5' }}>
                  <td style={{ ...td, fontWeight: 700 }}>{s.email}{s.user_id && <div style={{ fontSize: '0.72rem', color: '#71717A' }}>con cuenta</div>}</td>
                  <td style={td}><span style={{ fontWeight: 800, color: active ? '#15803D' : '#71717A' }}>{active ? 'Activo' : 'Baja'}</span></td>
                  <td style={td}>{s.source}</td>
                  <td style={td}>{fmtDate(s.subscribed_at)}</td>
                  <td style={td}>{fmtDate(s.unsubscribed_at)}</td>
                  <td style={td}>
                    <button type="button" onClick={() => toggle(s)} disabled={busyId === s.id}
                      aria-label={`${active ? 'Dar de baja' : 'Reactivar'} ${s.email}`} style={{ textDecoration: 'underline', fontWeight: 700 }}>
                      {active ? 'Dar de baja' : 'Reactivar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const th = { padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 800, color: '#71717A', letterSpacing: '0.05em' };
const td = { padding: '0.85rem 1rem', color: '#09090B' };

export default AdminNewsletterPage;
