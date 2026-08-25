import { create } from "zustand";

interface LightboxState {
  isOpen: boolean;
  type: "image" | "pano" | null;
  src: string | null;
  openLightbox: (type: "image" | "pano", src: string) => void;
  closeLightbox: () => void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  isOpen: false,
  type: null,
  src: null,
  openLightbox: (type, src) => set({ isOpen: true, type, src }),
  closeLightbox: () => set({ isOpen: false, type: null, src: null }),
}));
