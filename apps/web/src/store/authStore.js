import { create } from 'zustand';
import supabase from '../config/supabase';

/**
 * Real Supabase Auth Zustand Store
 * Sources of truth: Supabase Auth + PostgreSQL `profiles` table.
 * No mock users, no stored passwords.
 */
/** Mensajes de Supabase Auth en español (sin revelar si un correo existe). */
export function authMessage(err) {
  const m = String(err?.message || '');
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).';
  if (/user already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.';
  if (/password should be at least|weak password/i.test(m)) return 'La contraseña es demasiado débil: usa al menos 8 caracteres.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/unable to validate email|invalid email/i.test(m)) return 'El correo no es válido.';
  if (/fetch|network/i.test(m)) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

// Ejecución 56: varias lecturas del perfil pueden estar en vuelo a la vez (restaurar sesión, INITIAL_SESSION,
// TOKEN_REFRESHED, login). Solo se aplica la más reciente, y un perfil recién guardado (setProfile) invalida las que
// seguían en vuelo: antes, una lectura tardía devolvía el nombre viejo y pisaba lo que el cliente acababa de guardar.
let profileSeq = 0;
let latestProfile = Promise.resolve(null);

export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoggedIn: false,
  isLoading: true,
  error: null,

  setLoading: (loading) => set({ isLoading: loading }),

  /** Perfil recién guardado por el cliente: se aplica y descarta lecturas anteriores aún en vuelo. */
  setProfile: (profile) => { profileSeq += 1; latestProfile = Promise.resolve(profile); set({ profile }); },

  /** Lee el perfil; si mientras tanto empezó otra lectura o se guardó el perfil, devuelve el resultado más reciente. */
  loadProfile: async (userId) => {
    const seq = ++profileSeq;
    const mine = get().fetchProfile(userId);
    latestProfile = mine;
    const profile = await mine;
    if (seq === profileSeq) return profile;
    // Superada: esperar a la más reciente (nunca devolver un perfil vacío mientras la otra sigue en vuelo).
    let last;
    do { last = latestProfile; await last; } while (last !== latestProfile);
    return latestProfile;
  },

  // Carga el perfil del usuario desde PostgreSQL `profiles`
  fetchProfile: async (userId) => {
    if (!userId) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[authStore] Error fetching profile:', error);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[authStore] Exception fetching profile:', err);
      return null;
    }
  },

  // Inicializa y escucha la sesión autoritativa de Supabase Auth
  initAuth: async () => {
    set({ isLoading: true, error: null });

    try {
      // 1. Obtener sesión actual
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (session?.user) {
        const profile = await get().loadProfile(session.user.id);
        set({
          session,
          user: session.user,
          profile,
          isLoggedIn: true,
          isLoading: false
        });
      } else {
        set({
          session: null,
          user: null,
          profile: null,
          isLoggedIn: false,
          isLoading: false
        });
      }

      // 2. Escuchar cambios de estado en tiempo real (login, logout, token refresh)
      supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (newSession?.user) {
          const profile = await get().loadProfile(newSession.user.id);
          set({
            session: newSession,
            user: newSession.user,
            profile,
            isLoggedIn: true,
            isLoading: false
          });
        } else {
          set({
            session: null,
            user: null,
            profile: null,
            isLoggedIn: false,
            isLoading: false
          });
        }
      });
    } catch (err) {
      console.error('[authStore] Error initializing auth:', err);
      set({
        session: null,
        user: null,
        profile: null,
        isLoggedIn: false,
        isLoading: false,
        error: err.message
      });
    }
  },

  // Registro real con Supabase Auth
  signUp: async (email, password, fullName) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        const profile = await get().loadProfile(data.user.id);
        set({
          user: data.user,
          session: data.session,
          profile,
          isLoggedIn: !!data.session,
          isLoading: false
        });
      }
      return data;
    } catch (err) {
      const msg = authMessage(err);
      set({ error: msg, isLoading: false });
      throw Object.assign(new Error(msg), { cause: err });
    }
  },

  // Login con Google OAuth
  loginWithGoogle: async (redirectTo) => {
    set({ isLoading: true, error: null });
    try {
      const targetRedirect = redirectTo || `${window.location.origin}/admin`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: targetRedirect,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });

      if (error) throw error;
      return data;
    } catch (err) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  // Login real con email / contraseña
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      const profile = await get().loadProfile(data.user.id);

      set({
        user: data.user,
        session: data.session,
        profile,
        isLoggedIn: true,
        isLoading: false
      });

      return data;
    } catch (err) {
      const msg = authMessage(err);
      set({ error: msg, isLoading: false });
      throw Object.assign(new Error(msg), { cause: err });
    }
  },

  // Logout real
  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[authStore] SignOut warning:', err);
    } finally {
      set({
        user: null,
        session: null,
        profile: null,
        isLoggedIn: false,
        isLoading: false,
        error: null
      });
    }
  },

  checkSession: () => {
    // Redirige la comprobación de sesión a la inicialización de Supabase
    get().initAuth();
  },

  /**
   * Helper para verificar si el usuario tiene un rol determinado en `profiles`
   */
  hasRole: (allowedRoles) => {
    const profile = get().profile;
    if (!profile || !profile.role) return false;
    return allowedRoles.includes(profile.role);
  },

  /**
   * Helper para verificar si es administrador
   */
  isAdmin: () => {
    const profile = get().profile;
    return profile?.role === 'admin' || profile?.role === 'super_admin';
  }
}));

export default useAuthStore;
