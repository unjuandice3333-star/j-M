// M27 — Mock de @supabase/supabase-js para la Edge Function: registra las llamadas RPC y prohíbe el acceso directo
// a tablas (toda la lógica de pagos vive en apply_payment_event, probada con pgTAP y contra el stack local).
export const rpcMock = {
  calls: [] as { fn: string; args: unknown }[],
  response: { data: { result: 'applied', detail: 'order_paid', order_status: 'paid' } as any, error: null as any },
  reset() {
    this.calls = [];
    this.response = { data: { result: 'applied', detail: 'order_paid', order_status: 'paid' }, error: null };
  },
};

export function createClient(_url: string, _key: string, _opts?: unknown) {
  return {
    rpc: async (fn: string, args: unknown) => { rpcMock.calls.push({ fn, args }); return rpcMock.response; },
    from: (_table: string) => { throw new Error('la Edge Function no debe acceder a tablas directamente'); },
  };
}
