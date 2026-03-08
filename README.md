# Reelscape

An open-source, self-hosted media browser and player built with **Bun**, **React**, **Bootstrap**, and **SQLite**.

Browse your local movie and TV show library through a Netflix-style interface with carousel banners, genre filtering, episode browsing, and a full-featured video player with auto-play and seamless episode transitions.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- [FFmpeg](https://ffmpeg.org/) (for transcoding non-MP4 formats like MKV, AVI, WMV)

## Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd OSSFlix

# Install dependencies
bun install

# Create required directories
mkdir -p data/avatars

# Run the server
bun --hot index.ts
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker / Podman

### Build

```bash
# Docker
docker build -t reelscape:1.0.0 .

# Podman
podman build -t localhost/reelscape:1.0.0 .
```

### Run

Mount your media directory into the container at `/media`. The container exposes port 3000.

```bash
# Docker
docker run -d \
  -p 3001:3000 \
  -v /path/to/your/media:/media \
  --name reelscape \
  reelscape:1.0.0

# Podman
podman run -d \
  -p 3001:3000 \
  -v /path/to/your/media:/media \
  --name reelscape \
  localhost/reelscape:1.0.0
```

Then open [http://localhost:3001](http://localhost:3001) and go to **Settings** to set your Movies directory to `/media/Movies` and TV Shows directory to `/media/TV Shows`.

To stop and remove the container:

```bash
# Docker
docker stop reelscape
docker rm reelscape

# Podman
podman stop reelscape
podman rm reelscape
```

## Adding Media

Reelscape scans two directories — one for **Movies** and one for **TV Shows**. Each title lives in its own subfolder containing a `.toml` metadata file, a banner image, and video files.

### Directory Structure

```
Movies/
  YourMovie/
    metadata.toml         # metadata (required)
    banner.jpg            # banner image (optional, first image used)
    movie.mp4             # video file(s)

TV Shows/
  YourTVShow/
    metadata.toml
    banner.jpg
    Episode Title_s1_ep1.mp4
    Episode Title_s1_ep2.mp4
```

### TOML Metadata File

Every title folder **must** contain a `.toml` file. This is how Reelscape knows what to display.

#### Movie Example

```toml
[series]
name = "Your Movie Title"
type = "Movie"
description = "A brief synopsis of the movie."
genre = ["Action", "Drama"]
cast = ["Actor One", "Actor Two"]
```

#### TV Show Example

```toml
[series]
name = "Your TV Show"
type = "tv show"
season = 1
episodes = 12
description = "A brief synopsis of the show."
genre = ["Action", "Comedy", "Drama"]
cast = ["Actor One", "Actor Two"]
```

### TOML Fields Reference

| Field         | Required | Type       | Description                                |
|---------------|----------|------------|--------------------------------------------|
| `name`        | Yes      | string     | Display title                              |
| `type`        | Yes      | string     | `"Movie"` or `"tv show"`                   |
| `description` | Yes      | string     | Synopsis / description text                |
| `genre`       | Yes      | string[]   | Array of genre tags for categorization     |
| `cast`        | No       | string[]   | Array of cast member names                 |
| `season`      | No*      | integer    | Season number (*required for TV shows)     |
| `episodes`    | No*      | integer    | Episode count (*required for TV shows)     |

### Episode Naming Convention

For TV shows, name video files with this pattern so episodes are recognized and ordered:

```
<episode title>_s<season>_ep<episode>.<ext>
```

**Examples:**
```
Pilot_s1_ep1.mp4
The Journey Begins_s1_ep2.mp4
New Horizons_s2_ep1.mp4
```

- `_s1_` = Season 1
- `_ep1` = Episode 1
- The part before `_s` becomes the episode title (underscores are converted to spaces in the UI)

For **movies**, the filename doesn't matter — just place the video file in the folder.

### Supported Formats

**Images:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`

**Videos:** `.mp4`, `.mkv`, `.webm`

- `.mp4` and `.webm` are served directly to the browser
- `.mkv`, `.avi`, and `.wmv` are transcoded on-the-fly via FFmpeg

### Banner Image

Place one image file in the title folder. The first image found is used as the banner/poster. It appears in:
- The carousel on the home page
- The title card in genre rows
- The detail modal when clicking a title

## Setting Media Directories

By default, Reelscape looks for media in `./TestDir/Movies` and `./TestDir/TV Shows`.

To change these:

1. Click your **profile icon** in the top-right of the navbar
2. Open **Settings**
3. Use the **Browse** button to navigate to your Movies and TV Shows directories
4. Click **Save** — the library will rescan automatically

Directory paths are stored in the SQLite database and persist across restarts.

## Features

### Navigation
- **Home** (`/`) — Carousel of all titles + genre-filtered rows
- **Movies** (`/movies`) — All movies
- **TV Shows** (`/tvshows`) — All TV shows
- **Genre Filter** (`/genre/<name>`) — Select a genre from the navbar dropdown to see all matching titles

### Title Cards
- Hover to see a description overlay with zoom effect
- Click to open a detail modal with full info, cast, genre, and episode list

### Video Player
- Auto-play and auto-fullscreen on play
- Seamless episode transitions — next episode starts automatically
- Draggable progress bar with time preview tooltips
- Keyboard shortcuts:
  - `Space` / `K` — Play/Pause
  - `J` / `Left Arrow` — Skip back 10s
  - `L` / `Right Arrow` — Skip forward 10s
  - `Up Arrow` / `Down Arrow` — Volume
  - `M` — Mute
  - `F` — Fullscreen
  - `Escape` — Close player
- Double-click video to toggle fullscreen
- Playback speed control (0.25x to 2x)
- Auto-hide controls, cursor, and title after 1.5s of inactivity

### Profile
- Set display name and email
- Upload or browse for a profile picture
- Stored in SQLite, persists across sessions

## Adding a New Title (Step by Step)

1. **Create a folder** in your Movies or TV Shows directory:
   ```
   Movies/YourMovie/
   ```

2. **Create a `.toml` file** inside with metadata:
   ```toml
   [series]
   name = "Your Movie"
   type = "Movie"
   description = "A brief description of the movie."
   genre = ["Action", "Drama"]
   cast = ["Actor One", "Actor Two"]
   ```

3. **Add a banner image** (any supported image format):
   ```
   Movies/YourMovie/poster.jpg
   ```

4. **Add video file(s)**:
   ```
   Movies/YourMovie/movie.mp4
   ```

5. **Rescan the library** — either:
   - Restart the server (`bun --hot index.ts`)
   - Update the directory path in Settings (triggers a rescan)
   - Hit the API directly: `GET /api/media/resolve`

The new title will appear in the appropriate category and any matching genre pages.

## Project Structure

```
OSSFlix/
  index.ts              # Bun server with all API routes
  index.html            # HTML entry point
  frontend.tsx          # React app mount
  App.tsx               # React Router setup
  package.json
  components/
    Layout.tsx           # Navbar + page outlet
    Navbar.tsx           # Navigation bar with genre dropdown
    MediaCarousel.tsx    # Hero carousel with hover overlay + play
    SelectorMenu.tsx     # Genre row grid with title cards
    Card.tsx             # Title detail modal
    Episode.tsx          # Episode list item
    VideoPlayer.tsx      # Fullscreen video player
    ProfileSettings.tsx  # Profile + Settings modals
  pages/
    Hero.tsx             # Home page
    Movies.tsx           # Movies page
    TVShows.tsx          # TV Shows page
    Genre.tsx            # Genre filter page
  scripts/
    db.ts                # SQLite schema
    autoresolver.ts      # Media scanner + DB writer
    mediascanner.ts      # Filesystem scanner
    tomlreader.ts        # TOML parser
    profile.ts           # Profile CRUD
  constants/
    Genres.ts            # Genre list for navbar dropdown
  data/                  # SQLite DB + avatars (gitignored)
  images/                # Static images
```

## API Reference

| Method | Endpoint                     | Description                              |
|--------|------------------------------|------------------------------------------|
| GET    | `/api/media/categories`      | Get all categories with titles           |
| GET    | `/api/media/resolve`         | Rescan directories and return categories |
| GET    | `/api/media/info?dir=`       | Get detailed info for a title            |
| GET    | `/api/stream?src=`           | FFmpeg transcode stream                  |
| GET    | `/api/browse?path=&mode=`    | Browse filesystem directories/images     |
| GET    | `/api/profile`               | Get current profile                      |
| PUT    | `/api/profile`               | Update profile fields                    |
| POST   | `/api/profile/avatar`        | Upload avatar image (FormData)           |
| POST   | `/api/profile/avatar/browse` | Set avatar from filesystem path          |
| GET    | `/media/*`                   | Serve media files (with Range support)   |
| GET    | `/images/*`                  | Serve static images                      |
| GET    | `/avatars/*`                 | Serve avatar images                      |

## License

Open source. See LICENSE file for details.
