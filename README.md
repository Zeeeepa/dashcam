# Dashcam CLI

A command-line interface for Dashcam - the AI-powered screen recorder for developers. Capture your screen, track application activity, and automatically upload recordings to the cloud.

**Features:**
- 🎥 Background screen recording with FFmpeg
- 🔐 Secure authentication with API keys
- 📝 Automatic log tracking from web browsers and files
- ☁️ Automatic upload to Dashcam cloud storage
- 🎯 Application and window tracking
- 🖼️ Automatic GIF and snapshot generation

## Installation

Install globally via npm:

```bash
npm install -g dashcam
```

Or use with npx (no installation required):

```bash
npx dashcam --help
```

## Prerequisites

- Node.js 20 or higher
- FFmpeg (included via ffmpeg-static)
- macOS or Linux (Windows support coming soon)

## Quick Start

1. **Authenticate with your API key:**
   ```bash
   dashcam auth YOUR_API_KEY
   ```

2. **Start recording:**
   ```bash
   dashcam record
   ```

3. **Check recording status:**
   ```bash
   dashcam status
   ```

4. **Stop recording and upload:**
   ```bash
   dashcam stop
   ```

## Commands

### `dashcam auth <apiKey>`

Authenticate with TestDriver using your API key.

```bash
dashcam auth sk_test_1234567890abcdef
```

**Output:**
```
Successfully authenticated with API key
```

---

### `dashcam logout`

Logout from your Dashcam account and remove stored credentials.

```bash
dashcam logout
```

**Output:**
```
Successfully logged out
```

---

### `dashcam record [options]`

Start a background screen recording session.

**Options:**
- `-a, --audio` - Include audio in the recording
- `-f, --fps <fps>` - Frames per second (default: 30)
- `-o, --output <path>` - Custom output path for the recording
- `-t, --title <title>` - Title for the recording
- `-d, --description <description>` - Description for the recording (supports markdown)
- `-p, --project <project>` - Project ID to upload the recording to

**Examples:**

```bash
# Basic recording
dashcam record

# Recording with title and description
dashcam record --title "Bug Fix Demo" --description "Fixing the login button issue"

# Recording with audio at 60fps
dashcam record --audio --fps 60

# Recording to a specific project
dashcam record --project proj_abc123 --title "Feature Demo"
```

**Output:**
```
Starting recording...
Recording started successfully (PID: 12345)
Output: /Users/you/.dashcam/recordings/recording-2025-11-06-143022.webm
Use "dashcam status" to check progress
Use "dashcam stop" to stop recording and upload
Recording is running in background...
```

---

### `dashcam status`

Show the current recording status.

```bash
dashcam status
```

**Output (when recording):**
```
Recording in progress
Duration: 45.3 seconds
PID: 12345
Started: 11/6/2025, 2:30:22 PM
Title: Bug Fix Demo
```

**Output (when not recording):**
```
No active recording
```

---

### `dashcam stop`

Stop the current recording and upload to the cloud.

```bash
dashcam stop
```

**Output:**
```
Stopping recording...
Recording stopped successfully
Output saved to: /Users/you/.dashcam/recordings/recording-2025-11-06-143022.webm
Uploading recording...
✅ Upload complete! Share link: https://app.dashcam.io/share/rec_xyz789
```

---

### `dashcam track [options]`

Track logs from web URLs or application files.

**Options:**
- `--web <pattern>` - Web URL pattern to track (supports wildcards like `*`)
- `--app <pattern>` - Application file pattern to track (supports wildcards like `*`)
- `--name <name>` - Name for the tracking configuration

**Examples:**

```bash
# Track all GitHub pages
dashcam track --web "*github.com*" --name "GitHub"

# Track multiple social media sites
dashcam track --web "*twitter.com*" --name "Twitter"
dashcam track --web "*facebook.com*" --name "Facebook"

# Track a specific application
dashcam track --app "*Visual Studio Code*" --name "VS Code"
```

**Output:**
```
Web tracking pattern added successfully: *github.com*
```

---

### `dashcam logs [options]`

Manage log tracking for recordings.

**Options:**
- `--add` - Add a new log tracker
- `--remove <id>` - Remove a log tracker by ID
- `--list` - List all configured log trackers
- `--status` - Show log tracking status
- `--name <name>` - Name for the log tracker (required with --add)
- `--type <type>` - Type of tracker: "web" or "file" (required with --add)
- `--pattern <pattern>` - Pattern to track (can be used multiple times)
- `--file <file>` - File path for file type trackers

**Examples:**

```bash
# Add a web log tracker for social media
dashcam logs --add --name=social --type=web --pattern="*facebook.com*" --pattern="*twitter.com*"

# Add a file log tracker
dashcam logs --add --name=app-logs --type=file --file=/var/log/myapp.log

# List all trackers
dashcam logs --list

# Check tracking status
dashcam logs --status

# Remove a tracker
dashcam logs --remove social
```

**Output (--list):**
```
Currently configured trackers:

File trackers:
  file-1: /var/log/myapp.log

Web trackers:
  social: Social Media Tracker
    Patterns: *facebook.com*, *twitter.com*
  github: GitHub Tracker
    Patterns: *github.com*
```

**Output (--status):**
```
Log tracking status:
  Active recording instances: 1
  File trackers: 1
  Web trackers: 2
  Total recent events: 142

  File tracker activity (last minute):
    /var/log/myapp.log: 23 events
```

---

### `dashcam upload [filePath] [options]`

Upload a completed recording file or recover from an interrupted recording.

**Options:**
- `-t, --title <title>` - Title for the recording
- `-d, --description <description>` - Description for the recording
- `-p, --project <project>` - Project ID to upload to
- `--recover` - Attempt to recover and upload from interrupted recording

**Examples:**

```bash
# Upload a specific file
dashcam upload /path/to/recording.webm

# Upload with metadata
dashcam upload /path/to/recording.webm --title "Demo" --description "Product walkthrough"

# Recover from interrupted recording
dashcam upload --recover
```

**Output:**
```
Uploading recording...
✅ Upload complete! Share link: https://app.dashcam.io/share/rec_xyz789
```

---

### Global Options

All commands support these global options:

- `-v, --verbose` - Enable verbose logging output
- `--version` - Show version number
- `-h, --help` - Display help for command

**Examples:**

```bash
# Get help for a specific command
dashcam record --help

# Enable verbose logging
dashcam record --verbose

# Check version
dashcam --version
```

## Configuration

Dashcam stores its configuration and recordings in `~/.dashcam/`:

```
~/.dashcam/
├── config.json          # Authentication and settings
├── recordings/          # Local recordings
│   ├── recording-2025-11-06-143022.webm
│   └── dashcam_logs_cli.jsonl
└── tracking/           # Log tracking configurations
```

## Development

The project structure is organized as follows:

- `/bin` - CLI entry point
- `/lib` - Core functionality modules
  - `auth.js` - Authentication handling
  - `recorder.js` - Screen recording logic
  - `uploader.js` - Cloud upload functionality
  - `tracking/` - Activity and log tracking
  - `logs/` - Log management system

### Local Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Or link globally for testing
npm link
dashcam --help
```

## Troubleshooting

### Screen Recording Permission (macOS)

On macOS, you'll be prompted to grant screen recording permission the first time you run `dashcam record`. If you don't see the prompt or need to check permissions:

1. Go to **System Preferences → Security & Privacy → Privacy → Screen Recording**
2. Ensure Terminal (or your terminal app) is checked
3. Restart your terminal

### Recording Not Stopping

If a recording gets stuck, you can force stop it by finding the process:

```bash
# Find the recording process
ps aux | grep dashcam

# Kill the process (replace PID with actual process ID)
kill -9 PID
```

### Upload Failures

If uploads fail, recordings are saved locally in `~/.dashcam/recordings/`. You can manually upload them later:

```bash
dashcam upload ~/.dashcam/recordings/recording-2025-11-06-143022.webm
```

## License

MIT
