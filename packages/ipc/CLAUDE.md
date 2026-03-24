# @orderstack/ipc

Typed IPC channel constants shared between the Electron main process and renderer process.

## Purpose

Every `ipcMain.handle()` and `ipcRenderer.invoke()` call in the app must use a constant from `IPC` in `src/channels.ts`. This prevents channel name typos and gives TypeScript full coverage across the IPC boundary.

## Key Files

- `src/channels.ts` — the single source of truth for all IPC channel names, with JSDoc explaining each channel's purpose and payload shape
- `src/index.ts` — re-exports `IPC` and `IpcChannel`

## Rules

- Never hardcode a channel string in `ipcMain.handle()` or `ipcRenderer.invoke()` — always use `IPC.CHANNEL_NAME`
- When adding a new IPC channel, add it here first, then implement the handler in `apps/backoffice/electron/main/index.ts` and the caller in the renderer
- Channel names follow the pattern `namespace:action` (e.g., `device:get-id`, `auth:set-token`)

## Dependencies

None — this package has no runtime dependencies. It is pure TypeScript constants.
