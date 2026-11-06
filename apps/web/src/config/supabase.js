import { createClient } from '@supabase/supabase-js';
import { getClientConfig } from './clientConfig.js';

// Cliente Supabase del navegador. La configuración se valida al arrancar (M26-T3): sin valores por defecto,
// y la llave debe ser la pública/anon (nunca service_role ni una llave secreta).
const { supabase: supabaseConfig } = getClientConfig();

export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

export default supabase;
