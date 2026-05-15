const http = require("http");
const fs = require("fs");
const path = require("path");
const youtubeSearch = require("./api/youtube-search");
const youtubeStatus = require("./api/youtube-status");

const root = __dirname;
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

  serveFile(res, path.join(root, "index.html"), "text/html; charset=utf-8");
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`TuneScope is running at http://${host}:${port}`);
  });
}

module.exports = server;
