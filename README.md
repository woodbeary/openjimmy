# OpenJimmy 🍍

iMessage channel plugin for [OpenClaw](https://openclaw.ai) that works on **macOS 11+** (Big Sur, Monterey, Ventura, Sonoma).

No `imsg` CLI required — uses SQLite polling + AppleScript.

## Why?

The official `imsg` CLI requires macOS 12.3+ (Monterey). OpenJimmy works on older macOS versions by reading directly from the Messages SQLite database.

## Installation

```bash
# Clone to your OpenClaw plugins directory
git clone https://github.com/woodbeary/openjimmy.git ~/.openclaw/plugins/openjimmy
cd ~/.openclaw/plugins/openjimmy
npm install
```

Add to your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["~/.openclaw/plugins/openjimmy"]
    },
    "entries": {
      "openjimmy": { "enabled": true }
    }
  },
  "channels": {
    "imessage-legacy": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "allowFrom": ["+1234567890"]
    }
  }
}
```

Restart the gateway:
```bash
openclaw gateway restart
```

## Requirements

- **macOS 11+** (Big Sur, Monterey, Ventura, Sonoma)
- **Full Disk Access** for the OpenClaw process (to read Messages database)
- **Messages app** signed in with your Apple ID
- **Automation permission** (granted on first send)

## How it works

1. **Polls** `~/Library/Messages/chat.db` every second for new messages
2. **Routes** through OpenClaw's dispatch system (proper session management)
3. **Sends** replies via AppleScript to Messages.app

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable the channel |
| `dmPolicy` | `"allowlist"` | `allowlist`, `open`, or `disabled` |
| `allowFrom` | `[]` | Phone numbers/emails allowed to message |
| `pollIntervalMs` | `1000` | How often to check for new messages |

## Session Behavior

- **DMs** → Share the main agent session (`agent:main:main`)
- **Groups** → Isolated sessions per group

This matches the built-in iMessage channel behavior.

## Permissions

On first run, macOS will prompt for:

1. **Full Disk Access** — needed to read `chat.db`
2. **Automation** — needed to send via Messages.app

Grant these in System Preferences → Security & Privacy → Privacy.

## License

MIT

## Credits

Built with 🍍 by [woodbeary](https://github.com/woodbeary) and Claude during a late night hacking session.
