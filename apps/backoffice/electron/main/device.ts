import { createHash } from 'node:crypto'
import { networkInterfaces, platform, arch } from 'node:os'
import { machineIdSync } from 'node-machine-id'
import log from 'electron-log'

export interface DeviceFingerprint {
  hash: string
  components: {
    machineId: string
    primaryMac: string
    platform: string
    arch: string
  }
}

/**
 * Computes a stable composite hardware fingerprint.
 *
 * Uses multiple signals to improve stability:
 * - node-machine-id (OS-level UUID — most stable)
 * - Primary ethernet MAC address (excluded if virtual/loopback)
 * - OS platform + architecture
 *
 * The hash is SHA-256 over the concatenated component values.
 *
 * Fingerprint drift detection: if this hash differs from the stored hash
 * in the keychain, the IPC DEVICE_FINGERPRINT_DRIFTED event is emitted
 * and the user must re-register with admin approval.
 */
export function computeFingerprint(): DeviceFingerprint {
  const machineId = getMachineId()
  const primaryMac = getPrimaryMac()
  const osPlatform = platform()
  const osArch = arch()

  const raw = `${machineId}|${primaryMac}|${osPlatform}|${osArch}`
  const hash = createHash('sha256').update(raw).digest('hex')

  return {
    hash,
    components: {
      machineId,
      primaryMac,
      platform: osPlatform,
      arch: osArch,
    },
  }
}

function getMachineId(): string {
  try {
    return machineIdSync(true)
  } catch (err) {
    log.warn('device: could not read machine ID, falling back to hostname', err)
    return require('node:os').hostname()
  }
}

/**
 * Returns the MAC address of the first non-virtual, non-loopback
 * network interface. Returns 'unknown' if none found.
 *
 * Virtual and Docker interfaces are excluded to avoid instability
 * when VMs or containers are present.
 */
function getPrimaryMac(): string {
  const interfaces = networkInterfaces()
  const virtualPrefixes = ['vmnet', 'veth', 'docker', 'br-', 'lo', 'utun', 'awdl', 'llw']

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    const isVirtual = virtualPrefixes.some((prefix) =>
      name.toLowerCase().startsWith(prefix),
    )
    if (isVirtual) continue

    const addr = addrs.find((a) => !a.internal && a.mac !== '00:00:00:00:00:00')
    if (addr) return addr.mac
  }

  return 'unknown'
}
