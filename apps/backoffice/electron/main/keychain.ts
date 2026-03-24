import keytar from 'keytar'

const SERVICE = 'io.orderstack.backoffice'

/**
 * Wraps keytar for all credential storage operations.
 * Credentials are stored in the OS keychain:
 *   - macOS: Keychain Access
 *   - Windows: Credential Manager
 *   - Linux: libsecret / GNOME Keyring
 *
 * Keys used by the app:
 *   'access_token'     — JWT access token (15 min)
 *   'refresh_token'    — Refresh token (30 days)
 *   'device_cert'      — Signed RS256 device certificate
 *   'device_id'        — Registered device UUID
 *   'device_fingerprint' — Last known fingerprint hash (drift detection)
 */
export async function keychainSet(key: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE, key, value)
}

export async function keychainGet(key: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, key)
}

export async function keychainDelete(key: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE, key)
}

export async function keychainClearAll(): Promise<void> {
  const credentials = await keytar.findCredentials(SERVICE)
  await Promise.all(credentials.map((c) => keytar.deletePassword(SERVICE, c.account)))
}
