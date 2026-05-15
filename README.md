# TuneScope

TuneScope is a lightweight browser tool for finding popular songs and music videos on YouTube.

## What it does

- searches YouTube by song, artist, mood, genre, or year
- pulls real video stats from the YouTube Data API
- filters results by 100M, 200M, or 300M+ views
- optionally filters by minimum likes
- sorts by views, likes, like rate, or newest release
- opens matching songs directly on YouTube

## Local use

Run the app with the included local server:

```bash
YOUTUBE_API_KEY=your_key_here node server.js
```

Then open:

```text
http://127.0.0.1:4173
```

You can also run it with Vercel using `vercel dev`.

## Deploying on Vercel

Recommended settings:

- Framework Preset: `Other`
- Root Directory: `.`
- Build Command: leave empty
- Output Directory: `.`

Environment variables:

- `YOUTUBE_API_KEY` is required for live YouTube searches

## Notes

YouTube may hide or omit like counts for some videos. TuneScope only applies the like filter when a video's like count is available.
