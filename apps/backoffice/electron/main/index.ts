import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, Notification } from 'electron'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import AutoLaunch from 'auto-launch'
import { IPC } from '@orderstack/ipc'
import { computeFingerprint } from './device.js'
import {
  keychainSet,
  keychainGet,
  keychainDelete,
  keychainClearAll,
} from './keychain.js'

// ─── Logging ──────────────────────────────────────────────────────────────────
log.initialize()
log.transports.file.level = 'info'
autoUpdater.logger = log

// ─── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

// ─── State ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createMainWindow()
  createTray()
  registerDeepLink()
  registerIpcHandlers()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Handle second instance — focus existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ─── Main window ─────────────────────────────────────────────────────────────
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Load renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray(): void {
  const icon = nativeImage.createFromPath(
    join(__dirname, '../../resources/tray-icon.png'),
  )
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open OrderStack',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => autoUpdater.checkForUpdates(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ])

  tray.setToolTip('OrderStack Back Office')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// ─── Deep Linking ─────────────────────────────────────────────────────────────
function registerDeepLink(): void {
  app.setAsDefaultProtocolClient('orderstack')

  app.on('open-url', (_event, url) => {
    mainWindow?.webContents.send(IPC.DEEP_LINK_RECEIVED, { url })
  })
}

// ─── Auto Updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send(IPC.APP_UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
  })

  // Check for updates 5 seconds after launch, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5_000)
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1_000)
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────
function registerIpcHandlers(): void {
  // Device identity
  ipcMain.handle(IPC.DEVICE_GET_ID, async () => {
    const stored = await keychainGet('device_id')
    if (stored) return stored
    return null
  })

  ipcMain.handle(IPC.DEVICE_GET_INFO, async () => {
    const deviceId = await keychainGet('device_id')
    const cert = await keychainGet('device_cert')
    const fingerprint = computeFingerprint()
    return {
      id: deviceId,
      platform: process.platform,
      hostname: require('node:os').hostname(),
      hasCertificate: !!cert,
      fingerprint: fingerprint.hash,
    }
  })

  ipcMain.handle(IPC.DEVICE_IS_REGISTERED, async () => {
    const cert = await keychainGet('device_cert')
    const deviceId = await keychainGet('device_id')
    return !!(cert && deviceId)
  })

  ipcMain.handle(IPC.DEVICE_REGISTER, async (_event, { deviceId, certificate }: { deviceId: string; certificate: string }) => {
    const fingerprint = computeFingerprint()
    await keychainSet('device_id', deviceId)
    await keychainSet('device_cert', certificate)
    await keychainSet('device_fingerprint', fingerprint.hash)
    log.info(`device: registered as ${deviceId}`)
  })

  // Keychain
  ipcMain.handle(IPC.KEYCHAIN_SET, async (_event, { key, value }: { key: string; value: string }) => {
    await keychainSet(key, value)
  })

  ipcMain.handle(IPC.KEYCHAIN_GET, async (_event, { key }: { key: string }) => {
    return keychainGet(key)
  })

  ipcMain.handle(IPC.KEYCHAIN_DELETE, async (_event, { key }: { key: string }) => {
    return keychainDelete(key)
  })

  // Auth
  ipcMain.handle(IPC.AUTH_SET_TOKEN, async (_event, { token }: { token: string }) => {
    await keychainSet('access_token', token)
  })

  ipcMain.handle(IPC.AUTH_GET_TOKEN, async () => {
    return keychainGet('access_token')
  })

  ipcMain.handle(IPC.AUTH_SET_REFRESH, async (_event, { token }: { token: string }) => {
    await keychainSet('refresh_token', token)
  })

  ipcMain.handle(IPC.AUTH_GET_REFRESH, async () => {
    return keychainGet('refresh_token')
  })

  ipcMain.handle(IPC.AUTH_CLEAR, async () => {
    await keychainDelete('access_token')
    await keychainDelete('refresh_token')
    log.info('auth: cleared tokens')
  })

  // App lifecycle
  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion())

  ipcMain.handle(IPC.APP_UPDATE_DOWNLOAD, () => autoUpdater.downloadUpdate())

  ipcMain.handle(IPC.APP_UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_event, { url }: { url: string }) => {
    await shell.openExternal(url)
  })

  // Notifications
  ipcMain.handle(IPC.NOTIFY_SHOW, (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })
}

// ─── Vite HMR type declarations ───────────────────────────────────────────────
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string
