import crypto from 'crypto';

export function mockRes() {
  const res = { statusCode: 200, body: undefined, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

export const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** Builds a chainable Supabase query-builder fake driven by a table->handlers map. */
export function fakeSupabase(tables) {
  const calls = [];
  const from = (name) => {
    const t = tables[name] || {};
    const q = {
      select: () => q, eq: () => q, or: () => q,
      single: async () => t.single ?? { data: null, error: null },
      maybeSingle: async () => t.maybeSingle ?? { data: null, error: null },
      update: (v) => { calls.push([name, 'update', v]); return { eq: async () => t.write ?? { error: null } }; },
      insert: async (v) => { calls.push([name, 'insert', v]); return t.write ?? { error: null }; },
      upsert: async (v) => { calls.push([name, 'upsert', v]); return t.write ?? { error: null }; },
    };
    return q;
  };
  return { client: { from }, calls };
}
