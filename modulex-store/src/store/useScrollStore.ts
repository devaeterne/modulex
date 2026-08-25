import { create } from 'zustand';

interface ScrollStore {
  scroll: any;
  setScroll: (scroll: any) => void;
}

export const useScrollStore = create<ScrollStore>((set) => ({
  scroll: null,
  setScroll: (scroll) => set({ scroll }),
}));
