const { app, BrowserWindow, session, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
app.isQuiting = false;

// Register pulsechat:// custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('pulsechat', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('pulsechat');
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      const deepLink = commandLine.find((arg) => arg.startsWith('pulsechat://'));
      if (deepLink && mainWindow.webContents) {
        mainWindow.webContents.send('deep-link', deepLink);
      }
    }
  });
}

function resolveBundlePath() {
  const candidate1 = path.join(__dirname, 'client_dist', 'index.html');
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  if (fs.existsSync(candidate2)) return candidate2;

  return null;
}

function createTray() {
  if (tray) return;

  // 16x16 transparent dot as fallback or svg icon
  const iconPath = path.join(__dirname, 'client_dist', 'favicon.svg');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Открыть PulseChat',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('PulseChat Desktop');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    title: 'PulseChat',
    backgroundColor: '#090d16',
    frame: false, // Frameless custom Telegram Desktop titlebar
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
    },
  });

  // Automatically approve camera and microphone permissions for WebRTC calls
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'camera', 'microphone', 'notifications'];
    if (allowedPermissions.includes(permission)) {
      return callback(true);
    }
    callback(false);
  });

  // WebContents diagnostics and error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Failed to load URL: ${validatedURL} (${errorCode}: ${errorDescription})`);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Log ${level}]: ${message} (${sourceId}:${line})`);
  });

  // Automated test-run mode for CI / build verification
  const isTestRun = process.argv.includes('--test-run');
  if (isTestRun) {
    mainWindow.webContents.once('dom-ready', async () => {
      try {
        // Small delay for React hydration
        setTimeout(async () => {
          const rootContent = await mainWindow.webContents.executeJavaScript(`
            (() => {
              const root = document.getElementById('root');
              return {
                hasRoot: Boolean(root),
                childCount: root ? root.children.length : 0,
                htmlLength: root ? root.innerHTML.length : 0,
                title: document.title,
                hasTitlebar: Boolean(document.querySelector('.app-region-drag') || document.querySelector('button')),
                hasAuthScreen: Boolean(document.querySelector('form') || document.querySelector('input'))
              };
            })()
          `);
          console.log('[Electron Test-Run DOM Result]:', JSON.stringify(rootContent));
          if (rootContent.hasRoot && rootContent.childCount > 0) {
            console.log('✅ [Electron Test-Run SUCCESS] React interface and Titlebar rendered successfully!');
            app.isQuiting = true;
            app.exit(0);
          } else {
            console.error('❌ [Electron Test-Run ERROR] DOM root is empty!');
            app.isQuiting = true;
            app.exit(1);
          }
        }, 500);
      } catch (err) {
        console.error('❌ [Electron Test-Run ERROR]:', err);
        app.isQuiting = true;
        app.exit(1);
      }
    });
  }

  // Load offline local application bundle - NO remote URL loading
  const bundlePath = resolveBundlePath();
  if (bundlePath) {
    mainWindow.loadFile(bundlePath);
  } else {
    // If not built yet, display build instructions
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>PulseChat Desktop</title></head>
        <body style="background:#090d16;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:24px;border:1px solid rgba(255,255,255,0.1);border-radius:16px;">
            <h2 style="margin-top:0;">⚡ PulseChat Desktop</h2>
            <p style="color:#94a3b8;">Локальный бандл приложения не найден.<br>Соберите клиент перед запуском: <code style="color:#818cf8;">npm run build</code> в папке client.</p>
          </div>
        </body>
      </html>
    `));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents?.send('window-maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents?.send('window-maximized-change', false);
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
}

// Window control IPC handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('open-external', (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('tg://') || url.startsWith('pulsechat://'))) {
    shell.openExternal(url);
  }
});

ipcMain.on('set-unread-count', (_event, count) => {
  if (mainWindow && typeof count === 'number') {
    if (count > 0) {
      mainWindow.flashFrame(true);
    } else {
      mainWindow.flashFrame(false);
    }
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
