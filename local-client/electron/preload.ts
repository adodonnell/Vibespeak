import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Define allowed channels for security
const ALLOWED_SEND_CHANNELS = [
  'app:minimize',
  'app:maximize',
  'app:close',
  'matrix:login',
  'matrix:logout',
  'matrix:send-message',
  'voice:ptt-pressed',
  'voice:ptt-released',
] as const;

const ALLOWED_RECEIVE_CHANNELS = [
  'matrix:message-received',
  'matrix:connection-status',
  'app:theme-changed',
  'global-ptt',
  'deep-link',
] as const;

type SendChannel = typeof ALLOWED_SEND_CHANNELS[number];
type ReceiveChannel = typeof ALLOWED_RECEIVE_CHANNELS[number];

// Type-safe send function
function safeSend(channel: string, data?: unknown): void {
  if (!ALLOWED_SEND_CHANNELS.includes(channel as SendChannel)) {
    console.error(`Blocked send to unauthorized channel: ${channel}`);
    return;
  }
  ipcRenderer.send(channel, data);
}

// Type-safe receive function
function safeOn(channel: string, callback: (...args: unknown[]) => void): () => void {
  if (!ALLOWED_RECEIVE_CHANNELS.includes(channel as ReceiveChannel)) {
    console.error(`Blocked receive from unauthorized channel: ${channel}`);
    return () => {};
  }
  
  const listener = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
  ipcRenderer.on(channel, listener);
  
  // Return cleanup function
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  
  // Type-safe IPC methods
  send: (channel: string, data?: unknown) => safeSend(channel, data),
  on: (channel: string, callback: (...args: unknown[]) => void) => safeOn(channel, callback),
  
  // App control methods
  minimize: () => safeSend('app:minimize'),
  maximize: () => safeSend('app:maximize'),
  close: () => safeSend('app:close'),
  
  // Voice control methods
  pttPressed: () => safeSend('voice:ptt-pressed'),
  pttReleased: () => safeSend('voice:ptt-released'),
  
  // Screen capture: ask main process for capturable sources
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  
  // Fullscreen control
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),

  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

// Type declarations are in local-client/src/types/electron.d.ts
