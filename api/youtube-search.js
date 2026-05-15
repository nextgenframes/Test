function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseCount(value) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksLikeMusicVideo(item) {
  const title = item.snippet?.title?.toLowerCase() || "";
  const channel = item.snippet?.channelTitle?.toLowerCase() || "";
  const haystack = `${title} ${channel}`;
  const blocked = ["reaction", "cover", "karaoke", "tutorial", "lesson", "instrumental", "playlist"];
  const musicSignals = ["official", "music", "video", "lyrics", "song", "audio", "vevo"];

  if (blocked.some((word) => haystack.includes(word)) && !haystack.includes("official")) {
    return false;
  }

  return musicSignals.some((word) => haystack.includes(word));
}

async function youtubeJson(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "YouTube request failed.";
    throw new Error(message);
  }

  return data;
}

async function searchVideos({ key, query, maxResults, pageToken }) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", key);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", "10");
  url.searchParams.set("order", "viewCount");
  url.searchParams.set("safeSearch", "none");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("q", `${query} song OR music video`);
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  return youtubeJson(url);
}

async function getVideoStats({ key, ids }) {
  if (!ids.length) return [];

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("key", key);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("maxResults", "50");

  const data = await youtubeJson(url);
  return data.items || [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed." });
  }

  if (req.url.endsWith("/status")) {
    return json(res, 200, { ready: Boolean(process.env.YOUTUBE_API_KEY) });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return json(res, 503, {
      apiReady: false,
      error: "YouTube API key is missing.",
      videos: [],
    });
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const query = (requestUrl.searchParams.get("q") || "").trim();
  const minViews = clampNumber(requestUrl.searchParams.get("minViews"), 100000000, 0, 10000000000);
  const minLikes = clampNumber(requestUrl.searchParams.get("minLikes"), 0, 0, 1000000000);
  const maxResults = clampNumber(requestUrl.searchParams.get("maxResults"), 30, 1, 50);
  const pageToken = (requestUrl.searchParams.get("pageToken") || "").trim();

  if (!query) {
    return json(res, 400, { apiReady: true, error: "Search query is required.", videos: [] });
  }

  try {
    const searchData = await searchVideos({ key, query, maxResults, pageToken });
    const ids = (searchData.items || [])
      .map((item) => item.id?.videoId)
      .filter(Boolean);
    const statsItems = await getVideoStats({ key, ids });

    const videos = statsItems
      .filter(looksLikeMusicVideo)
      .map((item) => {
        const views = parseCount(item.statistics?.viewCount) || 0;
        const likes = parseCount(item.statistics?.likeCount);
        const thumbnails = item.snippet?.thumbnails || {};

        return {
          id: item.id,
          title: item.snippet?.title || "Untitled video",
          channelTitle: item.snippet?.channelTitle || "Unknown channel",
          publishedAt: item.snippet?.publishedAt || null,
          thumbnail: thumbnails.maxres?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "",
          views,
          likes,
        };
      })
      .filter((video) => video.views >= minViews)
      .filter((video) => minLikes === 0 || (video.likes !== null && video.likes >= minLikes))
      .sort((a, b) => b.views - a.views);

    return json(res, 200, {
      apiReady: true,
      query,
      minViews,
      minLikes,
      nextPageToken: searchData.nextPageToken || null,
      videos,
    });
  } catch (error) {
    return json(res, 502, {
      apiReady: true,
      error: error.message || "Could not search YouTube right now.",
      videos: [],
    });
  }
};
