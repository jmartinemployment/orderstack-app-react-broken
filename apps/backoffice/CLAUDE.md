# @orderstack/backoffice

Electron desktop application — the OrderStack back-office administration UI.

## Purpose

Merchant-facing desktop app for managing all back-office operations: dashboard, menu, inventory, employees, customers, payments, reports, accounting. Requires device registration before first use.

## Architecture

Two processes:
- **Main process** (`electron/main/`) — Node.js: device fingerprinting, OS keychain, IPC handlers, auto-update, tray
- **Renderer process** (`renderer/src/`) — React + Vite: all UI, communicates with main via context bridge only

## Key Files

- `electron/main/index.ts` — main process entry: creates window, registers all IPC handlers, sets up tray + deep link + auto-updater
- `electron/main/device.ts` — `computeFingerprint()` using node-machine-id + MAC + platform
- `electron/main/keychain.ts` — OS keychain wrapper via keytar
- `electron/preload/index.ts` — context bridge: the ONLY surface exposed to renderer
- `renderer/src/App.tsx` — root component: initializes auth + device stores on launch
- `renderer/src/router.tsx` — all routes with auth + device guards
- `renderer/src/store/auth.store.ts` — Zustand auth state with keychain-backed persistence
- `renderer/src/store/device.store.ts` — device registration state

## Device Registration

On first launch, the app checks for a device certificate in the keychain.
If absent, the renderer redirects to `/register-device`.
After registration, every API request includes X-Device-ID, X-Device-Cert, X-Device-Fingerprint headers.

## Running

```bash
pnpm dev      # electron-forge start (Vite HMR + Electron)
pnpm make     # build installable for current platform
```

## IPC Channels

All channel names come from `@orderstack/ipc`. Never hardcode channel strings.
The preload context bridge is the only way for renderer to call main process code.

## Dependencies

- `@orderstack/ipc` — typed IPC channel constants
- `@orderstack/ui` — shared component library
- `@orderstack/api-client` — generated REST API client
- `keytar` — OS keychain
- `node-machine-id` — stable machine identifier
- `electron-updater` — auto-update
