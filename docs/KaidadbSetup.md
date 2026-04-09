# KaidaDB Setup

KaidaDB is a content-addressed media storage server that OSSFlix can use to stream and discover media remotely. With KaidaDB, you can run OSSFlix without any local media files — all content (videos, images, metadata, subtitles) is served directly from KaidaDB.

## Prerequisites

- A running KaidaDB instance (see [KaidaDB README](https://github.com/UpdateReelscape/KaidaDB) for setup)
- OSSFlix configured with the KaidaDB URL in settings

## Configuration

### 1. Set the KaidaDB URL

In the OSSFlix settings panel (gear icon), enter your KaidaDB server URL under **KaidaDB Storage** (e.g., `http://localhost:8080`). Use the **Test** button to verify connectivity.

### 2. Choose a Discovery Mode

OSSFlix supports two modes for discovering remote media in KaidaDB:

#### Explicit Prefixes

Set separate prefixes for movies and TV shows. This gives you full control over which KaidaDB key prefixes map to each category.

| Field | Example | Description |
|---|---|---|
| Movies Prefix | `movies/` | All keys under this prefix are treated as movies |
| TV Shows Prefix | `tv/` | All keys under this prefix are treated as TV shows |

#### Root Prefix (Auto-Discovery)

Set a single **Root Prefix** and OSSFlix will scan all keys under it, reading each title's `metadata.toml` to determine whether it's a movie or TV show based on the `type` field.

| Field | Example | Description |
|---|---|---|
| Root Prefix | *(empty)* | Scans all keys in KaidaDB |
| Root Prefix | `media/` | Scans all keys under `media/` |

> **Note:** Root prefix mode takes priority over explicit prefixes. If a root prefix is set (even empty string), explicit prefixes are ignored.

## Storing Media in KaidaDB

### Key Structure

Media in KaidaDB is organized using `/`-delimited key paths. Each title lives in its own directory under a category prefix.

#### Movies

```
movies/
  Inception/
    metadata.toml        # Required — title metadata
    banner.jpg           # Optional — poster/banner image
    movie.mp4            # Video file
    subtitles.en.srt     # Optional — subtitle files
```

#### TV Shows — Flat Structure

```
tv/
  Breaking Bad/
    metadata.toml
    banner.jpg
    Pilot_s1_ep1.mp4
    Cats in the Bag_s1_ep2.mp4
    Seven Thirty Seven_s2_ep1.mp4
```

#### TV Shows — Nested Structure

```
tv/
  Breaking Bad/
    metadata.toml
    banner.jpg
    s01/
      ep01/
        Pilot_s1_ep1.mp4
      ep02/
        Cats in the Bag_s1_ep2.mp4
    s02/
      ep01/
        Seven Thirty Seven_s2_ep1.mp4
```

Both flat and nested structures are supported. Nested keys are automatically flattened into serve paths (e.g., `s01/ep01/Pilot_s1_ep1.mp4` becomes `/media/tvshows/Breaking Bad/Pilot_s1_ep1.mp4`). If filenames collide across directories, they are prefixed with the path segments (e.g., `s01_ep01_episode.mp4`).

### Episode Naming Convention

Episode video files should follow this naming pattern:

```
{Title}_s{season}_ep{episode}.{ext}
```

Examples:
- `Pilot_s1_ep1.mp4`
- `The Journey_s1_ep2.mkv`
- `New Arc_s2_ep1.webm`

This naming convention is used for automatic sorting by season and episode number.

### metadata.toml (Required)

Every title directory **must** contain a `metadata.toml` file. Without it, the title is skipped during discovery.

#### Movie Example

```toml
[series]
name = "Inception"
type = "Movie"
description = "A thief who steals corporate secrets through dream-sharing technology."
genre = ["Action", "Sci-Fi", "Thriller"]
cast = ["Leonardo DiCaprio", "Joseph Gordon-Levitt"]
```

#### TV Show Example

```toml
[series]
name = "Breaking Bad"
type = "tv show"
description = "A high school chemistry teacher turned methamphetamine manufacturer."
genre = ["Drama", "Crime", "Thriller"]
cast = ["Bryan Cranston", "Aaron Paul"]
season = 1
episodes = 7
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display title |
| `type` | string | Yes | `"Movie"` or `"tv show"` (case-insensitive) |
| `description` | string | Yes | Synopsis/description |
| `genre` | string[] | Yes | Array of genre tags |
| `cast` | string[] | No | Array of cast member names |
| `season` | number | TV shows | Season number |
| `episodes` | number | TV shows | Number of episodes |

### timing.toml (Optional, TV Shows)

For TV shows, you can include a `timing.toml` to define intro/outro skip timestamps:

```toml
[s01e01]
intro_start = "0:32"
intro_end = "1:30"
outro_start = "21:15"

[s01e02]
intro_start = 35
intro_end = 95
outro_start = "20:50"
outro_end = "22:00"
```

Timestamps can be either a number (seconds) or `"M:SS"` format.

### Supported File Formats

| Type | Extensions |
|---|---|
| Video | `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.wmv` |
| Image | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg` |
| Subtitle | `.srt`, `.vtt`, `.ass`, `.ssa` |

Subtitle files with language codes in the filename (e.g., `subs.en.srt`, `subs_fr.vtt`) are automatically labeled with the language name.

## Uploading Content to KaidaDB

Use the KaidaDB CLI or REST API to upload files:

```bash
# Upload a movie
curl -X PUT -H "Content-Type: video/mp4" \
  -T movie.mp4 \
  http://localhost:8080/v1/media/movies%2FInception%2Fmovie.mp4

# Upload metadata
curl -X PUT -H "Content-Type: application/toml" \
  -T metadata.toml \
  http://localhost:8080/v1/media/movies%2FInception%2Fmetadata.toml

# Upload a banner image
curl -X PUT -H "Content-Type: image/jpeg" \
  -T banner.jpg \
  http://localhost:8080/v1/media/movies%2FInception%2Fbanner.jpg
```

> **Note:** The `/` characters in keys must be URL-encoded as `%2F` in the REST API path.

You can also use the KaidaDB CLI if available:

```bash
kaidadb put movies/Inception/movie.mp4 --file movie.mp4
kaidadb put movies/Inception/metadata.toml --file metadata.toml
kaidadb put movies/Inception/banner.jpg --file banner.jpg
```

## Verifying Your Setup

After configuring prefixes and uploading content:

1. Save the settings — OSSFlix will automatically rescan and discover remote titles
2. Check the home page for your newly added titles
3. Verify poster images load correctly
4. Test video playback

You can also trigger a manual rescan via `GET /api/media/resolve`.

## Mixed Mode (Local + Remote)

OSSFlix supports running local and remote media side by side. Local titles are discovered from the configured movies/TV shows directories, and remote titles are discovered from KaidaDB prefixes. Both appear together in the library.

If a local and remote title share the same directory path (e.g., both have a title named "Inception" under movies), the later-scanned one takes precedence due to the unique `dir_path` constraint in the database.

## How Streaming Works

When a video is requested, OSSFlix resolves it in this order:

1. **KaidaDB** — If the file has a KaidaDB mapping, stream directly from KaidaDB (with full Range/seek support)
2. **Local transcode cache** — If a cached MP4 transcode exists locally
3. **Live FFmpeg transcode** — As a fallback for local files that need transcoding

For remote-only content (no local files), only step 1 applies. Videos stored in KaidaDB should already be in a browser-compatible format (MP4/H.264 recommended) since live transcoding is not available for remote-only files.

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/kaidadb/health` | GET | Test KaidaDB connectivity |
| `/api/kaidadb/status?src={path}` | GET | Check if a video has a KaidaDB mapping |
| `/api/kaidadb/ingest` | POST | Upload a local file to KaidaDB |
| `/api/global-settings` | GET/PUT | Read/update KaidaDB URL and prefix settings |
| `/api/media/resolve` | GET | Trigger a library rescan (includes remote discovery) |

## Troubleshooting

**Titles not appearing after setting prefixes**
- Verify KaidaDB is reachable (use the Test button)
- Ensure each title directory contains a `metadata.toml`
- Check the server console for scan errors

**Images not loading**
- Verify the image file exists in KaidaDB under the correct key
- Check browser dev tools for 404/502 responses on image URLs

**Video not playing**
- Ensure the video is in a browser-compatible format (MP4 with H.264/AAC recommended)
- Remote-only files cannot be live-transcoded — they must be pre-encoded

**"KaidaDB unreachable" errors**
- Check that the KaidaDB server is running and the URL is correct
- Verify network connectivity between OSSFlix and KaidaDB
