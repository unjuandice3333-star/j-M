import { createClient } from '@supabase/supabase-js';

// Inicialización del cliente Supabase para interactuar con la base de datos PostgreSQL
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
