# Dashcam CLI Minimal

A minimal command-line interface version of the Dashcam desktop application, focusing on core functionality:
- Screen recording using FFmpeg
- Authentication via Auth0
- Log tracking
- Automatic upload of recordings

## Prerequisites

- Node.js 14 or higher
- FFmpeg (included via ffmpeg-static)

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file with the following variables:

```
AUTH0_DOMAIN=your_auth0_domain
AUTH0_CLIENT_ID=your_auth0_client_id
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
```

## Usage

### Authentication

```bash
dashcam login
```

### Start Recording

```bash
# Record indefinitely
dashcam record

# Record for a specific duration (in seconds)
dashcam record --duration 60
```

### Stop Recording

```bash
dashcam stop
```

## Development

The project structure is organized as follows:

- `/bin` - CLI entry point
- `/lib` - Core functionality modules
- `/src` - Source code

## License

MIT
