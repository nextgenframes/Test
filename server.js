const http = require("http");
const fs = require("fs");
const path = require("path");
const youtubeSearch = require("./api/youtube-search");
const youtubeStatus = require("./api/youtube-status");
const aiStatus = require("./api/ai-status");
const avTriage = require("./api/av-triage");

const root = __dirname;
const distRoot = path.join(root, "dist");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/youtube-search")) {
    youtubeSearch(req, res);
    return;
  }

  if (req.url.startsWith("/api/youtube-status")) {
    youtubeStatus(req, res);
    return;
  }

  if (req.url.startsWith("/api/ai-status")) {
    aiStatus(req, res);
    return;
  }

  if (req.url.startsWith("/api/av-triage")) {
    avTriage(req, res);
    return;
  }

  if (req.url === "/favicon.svg") {
    serveFile(res, path.join(root, "favicon.svg"), "image/svg+xml; charset=utf-8");
    return;
  }

  const cleanPath = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
  const assetPath = path.join(distRoot, cleanPath);
  if (cleanPath !== "/" && assetPath.startsWith(distRoot) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
    const ext = path.extname(assetPath);
    const contentTypes = {
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml; charset=utf-8",
      ".html": "text/html; charset=utf-8",
    };
    serveFile(res, assetPath, contentTypes[ext] || "application/octet-stream");
    return;
  }

  const builtIndex = path.join(distRoot, "index.html");
  serveFile(res, fs.existsSync(builtIndex) ? builtIndex : path.join(root, "index.html"), "text/html; charset=utf-8");
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Bob on Call is running at http://${host}:${port}`);
  });
}

module.exports = server;
