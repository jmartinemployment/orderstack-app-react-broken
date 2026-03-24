import { create } from 'zustand'

interface DeviceInfo {
  id: string
  platform: string
  hostname: string
  hasCertificate: boolean
  fingerprint: string
}

interface DeviceState {
  isRegistered: boolean
  deviceInfo: DeviceInfo | null
  initialize: () => Promise<void>
  completeRegistration: (deviceId: string, certificate: string) => Promise<void>
}

export const useDeviceStore = create<DeviceState>((set) => ({
  isRegistered: false,
  deviceInfo: null,

  initialize: async () => {
    const isRegistered = await window.electron.device.isRegistered()
    const info = await window.electron.device.getInfo()
    set({ isRegistered, deviceInfo: info })

    // Listen for fingerprint drift events from main process
    window.electron.device.onFingerprintDrifted(() => {
      set({ isRegistered: false })
    })
  },

  completeRegistration: async (deviceId, certificate) => {
    await window.electron.device.register({ deviceId, certificate })
    const info = await window.electron.device.getInfo()
    set({ isRegistered: true, deviceInfo: info })
  },
}))
