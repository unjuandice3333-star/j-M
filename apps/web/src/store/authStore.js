import { create } from 'zustand';

// Zustand store for Authentication and Role-Based Access Control (RBAC)
export const useAuthStore = create((set, get) => ({
  user: null,
  isLoggedIn: false,
  isLoading: false,
  error: null,

  setLoading: (loading) => set({ isLoading: loading }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      // MOCK LOGIN SUCCESS (Supabase integration ready)
      // Standard enterprise roles: 'super_admin', 'admin', 'supervisor', 'cashier', 'warehouse'
      let role = 'cashier';
      let branch_id = 'b1000000-0000-0000-0000-000000000001'; // Default Bogotá branch
      let firstName = 'Juan';
      let lastName = 'Pérez';

      if (email.includes('admin')) {
        role = 'super_admin';
        firstName = 'Arley';
        lastName = 'Castro';
      } else if (email.includes('warehouse')) {
        role = 'warehouse';
        firstName = 'Carlos';
        lastName = 'Logística';
      }

      const mockUser = {
        id: 'u1000000-0000-0000-0000-000000000001',
        email,
        role,
        branch_id,
        first_name: firstName,
        last_name: lastName,
        is_active: true,
      };

      set({ user: mockUser, isLoggedIn: true, isLoading: false });
      localStorage.setItem('jm_auth_user', JSON.stringify(mockUser));
      return mockUser;
    } catch (err) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    set({ user: null, isLoggedIn: false, error: null });
    localStorage.removeItem('jm_auth_user');
  },

  checkSession: () => {
    const savedUser = localStorage.getItem('jm_auth_user');
    if (savedUser) {
      set({ user: JSON.parse(savedUser), isLoggedIn: true });
    }
  },

  /**
   * Helper para verificar si el usuario tiene un rol determinado.
   */
  hasRole: (allowedRoles) => {
    const user = get().user;
    if (!user) return false;
    return allowedRoles.includes(user.role);
  },
}));
export default useAuthStore;
