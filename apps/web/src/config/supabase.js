import { createClient } from '@supabase/supabase-js';

// Inicialización autoritativa del cliente Supabase (Fail-Fast sin fallbacks sintéticos)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[Supabase Config Error]: Las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son obligatorias y deben estar configuradas.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
