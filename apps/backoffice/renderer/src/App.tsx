import { useEffect } from 'react'
import { RouterProvider, createHashRouter } from 'react-router'
import { useAuthStore } from './store/auth.store'
import { useDeviceStore } from './store/device.store'
import { router } from './router'

export function App() {
  const { initialize: initAuth } = useAuthStore()
  const { initialize: initDevice } = useDeviceStore()

  useEffect(() => {
    // On launch: restore auth tokens from keychain and check device registration
    void initAuth()
    void initDevice()
  }, [initAuth, initDevice])

  return <RouterProvider router={router} />
}
