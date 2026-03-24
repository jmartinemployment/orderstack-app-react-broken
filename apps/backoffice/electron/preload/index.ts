import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@orderstack/ipc'

/**
 * Context bridge — the only surface exposed to the renderer process.
 * nodeIntegration is disabled; the renderer cannot access Node.js APIs directly.
 * Every capability must be explicitly exposed here.
 */
contextBridge.exposeInMainWorld('electron', {
  // ─── Device ────────────────────────────────────────────────────────────────
  device: {
    getId: () => ipcRenderer.invoke(IPC.DEVICE_GET_ID),
    getInfo: () => ipcRenderer.invoke(IPC.DEVICE_GET_INFO),
    isRegistered: () => ipcRenderer.invoke(IPC.DEVICE_IS_REGISTERED),
    register: (payload: { deviceId: string; certificate: string }) =>
      ipcRenderer.invoke(IPC.DEVICE_REGISTER, payload),
    onFingerprintDrifted: (cb: () => void) => {
      ipcRenderer.on(IPC.DEVICE_FINGERPRINT_DRIFTED, cb)
      return () => ipcRenderer.removeListener(IPC.DEVICE_FINGERPRINT_DRIFTED, cb)
    },
  },

  // ─── Keychain ──────────────────────────────────────────────────────────────
  keychain: {
    set: (key: string, value: string) =>
      ipcRenderer.invoke(IPC.KEYCHAIN_SET, { key, value }),
    get: (key: string) =>
      ipcRenderer.invoke(IPC.KEYCHAIN_GET, { key }),
    delete: (key: string) =>
      ipcRenderer.invoke(IPC.KEYCHAIN_DELETE, { key }),
  },

  // ─── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    setToken: (token: string) => ipcRenderer.invoke(IPC.AUTH_SET_TOKEN, { token }),
    getToken: () => ipcRenderer.invoke(IPC.AUTH_GET_TOKEN),
    setRefresh: (token: string) => ipcRenderer.invoke(IPC.AUTH_SET_REFRESH, { token }),
    getRefresh: () => ipcRenderer.invoke(IPC.AUTH_GET_REFRESH),
    clear: () => ipcRenderer.invoke(IPC.AUTH_CLEAR),
  },

  // ─── App ───────────────────────────────────────────────────────────────────
  app: {
    version: () => ipcRenderer.invoke(IPC.APP_VERSION),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, { url }),
    downloadUpdate: () => ipcRenderer.invoke(IPC.APP_UPDATE_DOWNLOAD),
    installUpdate: () => ipcRenderer.invoke(IPC.APP_UPDATE_INSTALL),
    onUpdateAvailable: (cb: (info: { version: string }) => void) => {
      ipcRenderer.on(IPC.APP_UPDATE_AVAILABLE, (_event, info) => cb(info))
      return () => ipcRenderer.removeAllListeners(IPC.APP_UPDATE_AVAILABLE)
    },
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  notify: {
    show: (title: string, body: string) =>
      ipcRenderer.invoke(IPC.NOTIFY_SHOW, { title, body }),
  },

  // ─── Deep Link ─────────────────────────────────────────────────────────────
  onDeepLink: (cb: (url: string) => void) => {
    ipcRenderer.on(IPC.DEEP_LINK_RECEIVED, (_event, { url }) => cb(url))
    return () => ipcRenderer.removeAllListeners(IPC.DEEP_LINK_RECEIVED)
  },
})
