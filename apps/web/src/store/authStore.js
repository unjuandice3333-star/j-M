import { create } from 'zustand';
import supabase from '../config/supabase';

/**
 * Real Supabase Auth Zustand Store
 * Sources of truth: Supabase Auth + PostgreSQL `profiles` table.
 * No mock users, no stored passwords.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoggedIn: false,
  isLoading: true,
  error: null,

  setLoading: (loading) => set({ isLoading: loading }),

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
        const profile = await get().fetchProfile(session.user.id);
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
          const profile = await get().fetchProfile(newSession.user.id);
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
        const profile = await get().fetchProfile(data.user.id);
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

      const profile = await get().fetchProfile(data.user.id);

      set({
        user: data.user,
        session: data.session,
        profile,
        isLoggedIn: true,
        isLoading: false
      });

      return data;
    } catch (err) {
      set({ error: err.message, isLoading: false });
      throw err;
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
