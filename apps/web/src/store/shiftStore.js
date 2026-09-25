import { create } from 'zustand';

// Store for managing cash drawer active shifts and daily reconciliations
export const useShiftStore = create((set, get) => ({
  activeShift: null,

  openShift: (initialCash, employeeId, branchId) => {
    const newShift = {
      id: `shift-${Date.now()}`,
      branch_id: branchId,
      employee_id: employeeId,
      opened_at: new Date().toISOString(),
      initial_cash: parseFloat(initialCash),
      status: 'OPEN',
    };
    set({ activeShift: newShift });
    localStorage.setItem('jm_pos_active_shift', JSON.stringify(newShift));
  },

  closeShift: (actualCash) => {
    const { activeShift } = get();
    if (!activeShift) return null;

    const cashValue = parseFloat(actualCash);
    const expectedCash = activeShift.initial_cash; // Simplificado para este paso
    const difference = cashValue - expectedCash;

    const closedShift = {
      ...activeShift,
      closed_at: new Date().toISOString(),
      actual_cash: cashValue,
      expected_cash: expectedCash,
      difference,
      status: 'CLOSED',
    };

    set({ activeShift: null });
    localStorage.removeItem('jm_pos_active_shift');
    return closedShift;
  },

  loadActiveShift: () => {
    const saved = localStorage.getItem('jm_pos_active_shift');
    if (saved) {
      set({ activeShift: JSON.parse(saved) });
    }
  },
}));

export default useShiftStore;
