// Type declarations for Electron API exposed via preload script
interface ElectronAPI {
  platform: NodeJS.Platform;
  send: (channel: string, data?: unknown) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  pttPressed: () => void;
  pttReleased: () => void;
  getScreenSources: () => Promise<Array<{ id: string; name: string; thumbnail: string; type: 'screen' | 'window' }>>;
  toggleFullscreen: () => Promise<boolean>;
  isFullscreen: () => Promise<boolean>;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};