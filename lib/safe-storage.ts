import type { StateStorage } from "zustand/middleware";

// localStorage can be missing (server rendering) or throw (blocked storage,
// some private modes). Fall back to memory so things still work for this visit.
const memory = new Map<string, string>();

/** localStorage for Zustand's persist middleware, falling back to memory. */
export const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      memory.delete(key);
    }
  },
};
