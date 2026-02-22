import { app, BrowserWindow, session, Tray, Menu, globalShortcut, nativeImage, desktopCapturer, ipcMain } from 'electron';
import path from 'path';
import { existsSync } from 'fs';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#36393f',
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Resolve index.html:
  //   Production (asar):   app.getAppPath() → resources/app.asar   → app.asar/dist/index.html  ✓
  //   Production (no asar): __dirname → dist-electron/              → ../dist/index.html         ✓
  //   Development:          __dirname → dist-electron/              → ../dist/index.html         ✓
  const appRoot = app.getAppPath(); // always the asar root (or app dir in dev/no-asar)
  const possiblePaths = [
    path.join(appRoot, 'dist', 'index.html'),      // production with asar
    path.join(__dirname, '../dist/index.html'),     // production without asar / dev
    path.join(__dirname, '../../dist/index.html'),  // fallback
  ];

  let loaded = false;
  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      mainWindow.loadFile(filePath);
      console.log('[Electron] Loaded:', filePath);
      loaded = true;
      break;
    }
    console.log('[Electron] Not found, tried:', filePath);
  }

  if (!loaded) {
    mainWindow.loadURL(
      'data:text/html,<h2 style="font-family:sans-serif;padding:2rem">' +
      'Disorder: could not locate app bundle. Looked in:<br><pre>' +
      possiblePaths.join('<br>') +
      '</pre></h2>'
    );
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Create a simple tray icon (16x16 transparent)
  const icon = nativeImage.createEmpty();
  
  tray = new Tray(icon);
  tray.setToolTip('VibeSpeak');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VibeSpeak',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    },
  ]);
  
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function registerGlobalShortcuts() {
  // Register global shortcut for push-to-talk (Ctrl+Shift+V)
  // This allows PTT even when app is not focused
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    console.log('[Electron] Global PTT shortcut triggered');
    // This would need to communicate with the renderer process
    // For now, we just log it
    mainWindow?.webContents.send('global-ptt', true);
  });
  
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    // Release
    console.log('[Electron] Global PTT shortcut released');
    mainWindow?.webContents.send('global-ptt', false);
  });
}

function setupDeepLinks() {
  // Register protocol handler for vibespeak:// URLs
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('disorder', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('disorder');
  }
  
  // Handle protocol URL on Windows
  app.on('second-instance', (_event, commandLine) => {
    // Someone tried to run a second instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    // Handle the deep link
    const url = commandLine.find(arg => arg.startsWith('disorder://'));
    if (url) {
      handleDeepLink(url);
    }
  });
}

function handleDeepLink(url: string) {
  console.log('[Electron] Deep link:', url);
  // Parse the URL and navigate
  // vibespeak://join/server-id
  // vibespeak://channel/server-id/channel-id
  if (mainWindow) {
    mainWindow.webContents.send('deep-link', url);
  }
}

app.whenReady().then(() => {
  // ── Screen capture (Electron 20+) ────────────────────────────────────────
  // Without this handler getDisplayMedia throws "DOMException: Not supported".
  // The renderer can call getScreenSources() to show a picker UI, then store
  // the selected source ID in sessionStorage. We use that ID here.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      
      // Check if renderer specified a source ID via sessionStorage
      // Execute JavaScript in the main window to read the value
      let selectedSourceId: string | null = null;
      if (mainWindow) {
        try {
          selectedSourceId = await mainWindow.webContents.executeJavaScript(
            `sessionStorage.getItem('vibespeak:screen-source')`
          );
          // Clear it after reading so it doesn't persist
          await mainWindow.webContents.executeJavaScript(
            `sessionStorage.removeItem('vibespeak:screen-source')`
          );
        } catch (e) {
          console.log('[Electron] Could not read selected source from renderer');
        }
      }
      
      // Find the selected source, or fall back to first screen
      let screen = selectedSourceId 
        ? sources.find(s => s.id === selectedSourceId)
        : null;
      
      // If no matching source found, prefer "Entire Screen" or first screen
      if (!screen) {
        screen = sources.find(s => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
      }
      
      if (screen) {
        console.log('[Electron] Sharing screen:', screen.name);
        callback({ video: screen, audio: 'loopback' });
      } else {
        callback({} as any); // nothing to share
      }
    } catch (err) {
      console.error('[Electron] setDisplayMediaRequestHandler error:', err);
      callback({} as any);
    }
  });

  // IPC: renderer asks for a list of capturable sources (so it can show a picker)
  ipcMain.handle('get-screen-sources', async () => {
    try {
      // Get screens and windows separately to properly identify them
      const [screens, windows] = await Promise.all([
        desktopCapturer.getSources({ 
          types: ['screen'],
          thumbnailSize: { width: 320, height: 180 }
        }),
        desktopCapturer.getSources({ 
          types: ['window'],
          thumbnailSize: { width: 320, height: 180 }
        })
      ]);
      
      // Tag each source with its type
      const screenSources = screens.map(s => ({
        id: s.id,
        name: s.name || 'Screen',
        thumbnail: s.thumbnail,
        type: 'screen' as const
      }));
      
      const windowSources = windows.map(s => ({
        id: s.id,
        name: s.name || 'Window',
        thumbnail: s.thumbnail,
        type: 'window' as const
      }));
      
      // Combine: screens first, then windows
      const allSources = [...screenSources, ...windowSources];
      
      console.log('[Electron] getScreenSources:', allSources.length, 'sources');
      console.log(`  - ${screenSources.length} screens, ${windowSources.length} windows`);
      allSources.forEach(s => console.log(`  - [${s.type}] ${s.name}`));
      
      return allSources;
    } catch (err) {
      console.error('[Electron] getScreenSources error:', err);
      return [];
    }
  });

  // Set up permissions for microphone access
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  // Allow microphone and camera permissions
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    return true;
  });

  createWindow();
  createTray();
  registerGlobalShortcuts();
  setupDeepLinks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

// Handle open-url event on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  isQuitting = true;
});
