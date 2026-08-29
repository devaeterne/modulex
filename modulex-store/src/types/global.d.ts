type PannellumViewerOptions = Record<string, string | number | boolean>;

type PannellumViewer = {
  destroy: () => void;
};

interface Window {
  pannellum?: {
    viewer: (element: string | HTMLElement, options: PannellumViewerOptions) => PannellumViewer;
  };
  libpannellum?: unknown;
}
