export interface ApiClientConfig {
  baseUrl: string
  getToken: () => Promise<string | null>
  getDeviceId: () => Promise<string | null>
  getDeviceCert: () => Promise<string | null>
  getDeviceFingerprint: () => Promise<string>
}

/**
 * Creates a typed API client that automatically attaches:
 * - Authorization: Bearer <token>
 * - X-Device-ID
 * - X-Device-Cert
 * - X-Device-Fingerprint
 *
 * Used by the renderer to communicate with the cloud API.
 * Token retrieval and device header values come from the Electron
 * keychain via the IPC bridge.
 */
export function createApiClient(config: ApiClientConfig) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const [token, deviceId, deviceCert, fingerprint] = await Promise.all([
      config.getToken(),
      config.getDeviceId(),
      config.getDeviceCert(),
      config.getDeviceFingerprint(),
    ])

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (token) headers['Authorization'] = `Bearer ${token}`
    if (deviceId) headers['X-Device-ID'] = deviceId
    if (deviceCert) headers['X-Device-Cert'] = deviceCert
    if (fingerprint) headers['X-Device-Fingerprint'] = fingerprint

    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new ApiError(response.status, error)
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`API error ${status}`)
    this.name = 'ApiError'
  }
}
