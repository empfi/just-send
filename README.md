# Just Send

A fast, private file server for your local network. Move files and text between your computer and phone over Wi-Fi, with no cloud account or external service.

## Features

- QR code and 6-digit code pairing
- Master and connector device roles
- Drag-and-drop uploads, folders, previews, and ZIP downloads
- Shared text drop for links, snippets, and codes
- Live updates across connected devices
- Workspace recovery with a 12-word phrase

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

Copy `.env.example` to `.env` to change the port, host, or upload limit.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3456` | HTTP port |
| `SERVER_PORT` | unset | Hosting-assigned port; takes precedence over `PORT` |
| `SERVER_IP` | unset | Host-provided public address for the startup QR |
| `PUBLIC_URL` | auto | Optional public origin override for the startup QR |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_FILE_SIZE_BYTES` | 50 GB | Per-file upload limit |

## Data

Uploads and workspace metadata are stored in `data/`, which is excluded from git. Back up that folder to keep your files and workspace recovery data.

## License

MIT
