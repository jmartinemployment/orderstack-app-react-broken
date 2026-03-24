/**
 * Typed IPC channel constants shared between Electron main process and renderer.
 * Every channel used in ipcMain.handle() and ipcRenderer.invoke() must be
 * declared here. Prevents channel name drift and gives TypeScript full coverage.
 */
export const IPC = {
  // ─── Device Identity ──────────────────────────────────────────────────────
  /** Returns the stable hardware fingerprint string for this machine */
  DEVICE_GET_ID: 'device:get-id',
  /** Returns full device info: { id, platform, hostname, registeredAt, locationId } */
  DEVICE_GET_INFO: 'device:get-info',
  /** Sends fingerprint + locationId to API, stores returned certificate in keychain */
  DEVICE_REGISTER: 'device:register',
  /** Checks whether a certificate is stored in the keychain (returns boolean) */
  DEVICE_IS_REGISTERED: 'device:is-registered',
  /** Called when the fingerprint has changed since registration (drift detected) */
  DEVICE_FINGERPRINT_DRIFTED: 'device:fingerprint-drifted',

  // ─── Secure Credential Storage (OS keychain) ──────────────────────────────
  /** Store a value in the OS keychain under a given key */
  KEYCHAIN_SET: 'keychain:set',
  /** Retrieve a value from the OS keychain by key */
  KEYCHAIN_GET: 'keychain:get',
  /** Delete a value from the OS keychain by key */
  KEYCHAIN_DELETE: 'keychain:delete',

  // ─── Authentication ────────────────────────────────────────────────────────
  /** Store JWT access token in keychain */
  AUTH_SET_TOKEN: 'auth:set-token',
  /** Retrieve JWT access token from keychain */
  AUTH_GET_TOKEN: 'auth:get-token',
  /** Store refresh token in keychain */
  AUTH_SET_REFRESH: 'auth:set-refresh',
  /** Retrieve refresh token from keychain */
  AUTH_GET_REFRESH: 'auth:get-refresh',
  /** Wipe all auth entries from keychain (logout) */
  AUTH_CLEAR: 'auth:clear',

  // ─── App Lifecycle ────────────────────────────────────────────────────────
  /** Returns the current app version string from package.json */
  APP_VERSION: 'app:version',
  /** Emitted by main when an update is available; payload: { version: string } */
  APP_UPDATE_AVAILABLE: 'app:update-available',
  /** Trigger the update download */
  APP_UPDATE_DOWNLOAD: 'app:update-download',
  /** Quit and install the downloaded update */
  APP_UPDATE_INSTALL: 'app:update-install',
  /** Open a URL in the system browser (used for OAuth flows) */
  APP_OPEN_EXTERNAL: 'app:open-external',

  // ─── Notifications ────────────────────────────────────────────────────────
  /** Trigger a native OS notification; payload: { title: string, body: string } */
  NOTIFY_SHOW: 'notify:show',

  // ─── Deep Link ────────────────────────────────────────────────────────────
  /**
   * Emitted by main when an orderstack:// deep link is received.
   * Payload: { url: string } — renderer parses and handles the route.
   */
  DEEP_LINK_RECEIVED: 'deep-link:received',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
