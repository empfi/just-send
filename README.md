# Just Send

A fast, private file server for your local network. Move files and text between your computer and phone over Wi-Fi, with no cloud account or external service.

## Features

- QR code and 6-digit code pairing
- Master and connector device roles
- Drag-and-drop uploads, folders, previews, and ZIP downloads
- Shared text drop for links, snippets, and codes
- Live updates across connected devices
- Workspace recovery with a 12-word phrase
- Configurable instance name, logo, and accent color

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm start
```

Open http://localhost:3456. The server listens on all interfaces. The Connect dialog and startup QR use the public address the app is reachable on, falling back to the LAN address.

## Development

```bash
npm run dev
```

The API runs on port 3456 and Vite serves the client on http://localhost:5173.

## Configuration

Copy `.env.example` to `.env` and restart the server to change these values. Variables already set by the host take precedence over the file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3456` | HTTP port |
| `SERVER_PORT` | unset | Hosting-assigned port; takes precedence over `PORT` |
| `SERVER_IP` | unset | Host-provided public address for the startup QR |
| `PUBLIC_URL` | auto | Optional public origin override for the startup QR |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_FILE_SIZE_BYTES` | 50 GB | Per-file upload limit |
| `LOG_LEVELS` | `error` | Comma-separated console log levels: `info`, `warn`, `error` |
| `ALLOW_DELETE_WORKSPACE` | `true` | Set to `false` to block deleting workspaces |
| `ALLOW_LEAVE_WORKSPACE` | `true` | Set to `false` to block leaving workspaces |
| `INSTANCE_NAME` | `Just Send` | Name in the header and page title |
| `INSTANCE_LOGO` | bundled mark | Logo path relative to the project root |
| `INSTANCE_ACCENT_COLOR` | `#3b82f6` | Accent color for the interface |

## Customize your instance

Set the branding variables in `.env` and restart the server:

```bash
INSTANCE_NAME=Acme Drop
INSTANCE_LOGO=branding/logo.svg
INSTANCE_ACCENT_COLOR=#6ee7b7
```

`INSTANCE_LOGO` is a path relative to the project root. SVG, PNG, JPEG, WebP, and GIF files are supported. The logo is used in the header and as the favicon. If the path is missing, the bundled mark is used.

## Logs

Server activity, warnings, and errors are printed to the console the server runs in. Only errors are logged by default. Set `LOG_LEVELS` in `.env` to change that, for example `LOG_LEVELS=error,warn` or `LOG_LEVELS=info,warn,error`. Nothing is written to disk.

## Data

Uploads and workspace metadata are stored in `data/`, which is excluded from git. Back up that folder to keep your files and workspace recovery data.

## License

MIT
