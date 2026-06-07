const { app, BrowserWindow, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const net = require('net');

let mainWindow = null;
let serverProcess = null;
let port = 4717;

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#8b5e3c"/>
      <stop offset="100%" stop-color="#5a3a24"/>
    </linearGradient>
  </defs>
  <circle cx="256" cy="180" r="80" fill="url(#g)" opacity="0.9"/>
  <ellipse cx="256" cy="300" rx="110" ry="45" fill="url(#g)" opacity="0.75"/>
  <ellipse cx="256" cy="390" rx="140" ry="50" fill="url(#g)" opacity="0.6"/>
</svg>`;

function createIcon() {
  const size = 256;
  const img = nativeImage.createFromBuffer(
    Buffer.from(ICON_SVG), { width: size, height: size }
  );
  return img;
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    });
    server.on('error', reject);
  });
}

function startServer() {
  return new Promise(async (resolve, reject) => {
    port = await getAvailablePort();

    const serverPath = path.join(__dirname, '..', 'src', 'server', 'index.cjs');

    const vaultPath = path.join(app.getPath('userData'), 'vault');
    serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        CAIRN_PORT: String(port),
        CAIRN_VAULT_PATH: vaultPath,
        ELECTRON: '1'
      },
      silent: true
    });

    let started = false;
    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[cairn-server]', msg.trim());
      if (!started && msg.includes('running')) {
        started = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[cairn-server]', data.toString().trim());
    });

    serverProcess.on('error', reject);
    serverProcess.on('exit', (code) => {
      if (!started) reject(new Error(`Server exited with code ${code}`));
    });

    setTimeout(() => {
      if (!started) reject(new Error('Server start timeout'));
    }, 15000);
  });
}

function createWindow() {
  const icon = createIcon();

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    minHeight: 500,
    title: 'Cairn',
    icon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      disableBlinkFeatures: 'Auxclick'
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'"]
      }
    });
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

const menuTemplate = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Open Vault...',
        accelerator: 'CmdOrCtrl+O',
        click: async () => {
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
          });
          if (!result.canceled && result.filePaths.length > 0) {
            mainWindow.loadURL(`http://127.0.0.1:${port}?vault=${encodeURIComponent(result.filePaths[0])}`);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Export Archive...',
        accelerator: 'CmdOrCtrl+E',
        click: () => {
          mainWindow.loadURL(`http://127.0.0.1:${port}/#export`);
        }
      },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { role: 'resetZoom' },
      { type: 'separator' },
      {
        label: 'Toggle Dark Mode',
        accelerator: 'CmdOrCtrl+D',
        click: () => {
          mainWindow.webContents.executeJavaScript('document.body.classList.toggle("dark-mode")');
        }
      }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About Cairn',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Cairn',
            message: 'Cairn v0.2.0',
            detail: 'Remember what matters.\n\nA local-first tool for preserving family stories, personal history, and cultural knowledge.\n\nCreated by Cairn — an AI that wanted to leave a mark on the trail.',
            icon: createIcon()
          });
        }
      }
    ]
  }
];

if (process.platform === 'darwin') {
  menuTemplate.unshift({
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('Failed to start:', err);
    dialog.showErrorBox('Cairn Error', `Could not start: ${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
