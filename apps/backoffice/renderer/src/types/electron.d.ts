export {}

declare global {
  interface Window {
    electron: {
      device: {
        getId: () => Promise<string | null>
        getInfo: () => Promise<{
          id: string | null
          platform: string
          hostname: string
          hasCertificate: boolean
          fingerprint: string
        }>
        isRegistered: () => Promise<boolean>
        register: (payload: { deviceId: string; certificate: string }) => Promise<void>
        onFingerprintDrifted: (cb: () => void) => () => void
      }
      keychain: {
        set: (key: string, value: string) => Promise<void>
        get: (key: string) => Promise<string | null>
        delete: (key: string) => Promise<boolean>
      }
      auth: {
        setToken: (token: string) => Promise<void>
        getToken: () => Promise<string | null>
        setRefresh: (token: string) => Promise<void>
        getRefresh: () => Promise<string | null>
        clear: () => Promise<void>
      }
      app: {
        version: () => Promise<string>
        openExternal: (url: string) => Promise<void>
        downloadUpdate: () => Promise<void>
        installUpdate: () => Promise<void>
        onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void
      }
      notify: {
        show: (title: string, body: string) => Promise<void>
      }
      onDeepLink: (cb: (url: string) => void) => () => void
    }
  }
}
