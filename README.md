# OpenJimmy 📱

**iMessage channel plugin for OpenClaw** — Works on macOS 11+ (Big Sur, Monterey, Ventura, Sonoma, Sequoia)

Talk to your AI assistant via iMessage. No third-party services, no cloud relay — just your Mac.

## Features

- ✅ Direct SQLite polling (no CLI tools needed)
- ✅ AppleScript for sending (native macOS)
- ✅ Works on older Macs (macOS 11+)
- ✅ Duplicate message prevention
- ✅ Group chat support
- ✅ Media attachments

## Quick Install

```bash
# Clone the repo
git clone https://github.com/woodbeary/openjimmy.git
cd openjimmy

# Run the setup wizard
node setup.js
```

The wizard will:
1. Check your macOS version and permissions
2. Install dependencies
3. Help configure OpenClaw
4. Test the connection

## Manual Install

### Prerequisites

- macOS 11+ (Big Sur or later)
- Node.js 18+
- [OpenClaw](https://github.com/openclaw/openclaw) installed
- Full Disk Access enabled for Terminal

### Enable Full Disk Access

1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Select **Full Disk Access** from the sidebar
3. Click the lock 🔒 and authenticate
4. Click **+** and add **Terminal** (or iTerm, etc.)
5. Restart Terminal

### Install

```bash
git clone https://github.com/woodbeary/openjimmy.git
cd openjimmy
npm install
```

### Configure

Add to your `~/.openclaw/config.yaml`:

```yaml
channels:
  imessage-legacy:
    plugin: "/path/to/openjimmy"
    ownerNumbers:
      - "+1XXXXXXXXXX"  # Your phone number
```

### Start

```bash
openclaw gateway restart
```

## Configuration Options

```yaml
channels:
  imessage-legacy:
    plugin: "/path/to/openjimmy"
    
    # Required: Numbers that can control the bot (your numbers)
    ownerNumbers:
      - "+19995551234"
    
    # Optional: Additional allowed numbers
    allowedNumbers:
      - "+19995555678"
    
    # Optional: Poll interval in ms (default: 2000)
    pollInterval: 2000
    
    # Optional: Enable debug logging
    debug: false
```

## Troubleshooting

### "Operation not permitted" error

Full Disk Access isn't enabled. See [Enable Full Disk Access](#enable-full-disk-access).

### Messages send but no response

1. Check the gateway is running: `openclaw gateway status`
2. Check logs: `tail -f ~/.openclaw/gateway.log`
3. Make sure your number is in `ownerNumbers`

### AppleScript errors

Allow Terminal to control Messages:
1. **System Preferences** → **Security & Privacy** → **Privacy** → **Automation**
2. Enable **Terminal** → **Messages**

### Duplicate messages

This was fixed in v1.0.0. If you're seeing duplicates, update to the latest version:
```bash
cd openjimmy && git pull && npm install
openclaw gateway restart
```

## How It Works

1. **Polling**: Reads new messages from `~/Library/Messages/chat.db` (SQLite)
2. **Processing**: Sends messages to OpenClaw for AI response
3. **Sending**: Uses AppleScript to send replies via Messages.app

No external services. Everything runs locally on your Mac.

## Requirements

| macOS Version | Status |
|--------------|--------|
| 15 (Sequoia) | ✅ |
| 14 (Sonoma) | ✅ |
| 13 (Ventura) | ✅ |
| 12 (Monterey) | ✅ |
| 11 (Big Sur) | ✅ |
| 10.x | ❌ Not supported |

## License

MIT © [woodbeary](https://github.com/woodbeary)

---

Part of the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem 🐾
