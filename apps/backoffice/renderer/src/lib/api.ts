import { createApiClient } from '@orderstack/api-client'

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export const api = createApiClient({
  baseUrl: API_URL,
  getToken: () => window.electron.auth.getToken(),
  getDeviceId: () => window.electron.keychain.get('device_id'),
  getDeviceCert: () => window.electron.keychain.get('device_cert'),
  getDeviceFingerprint: async () => {
    const info = await window.electron.device.getInfo()
    return info.fingerprint
  },
})
