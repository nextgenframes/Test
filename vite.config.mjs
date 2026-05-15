import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const youtubeSearch = require("./api/youtube-search");
const youtubeStatus = require("./api/youtube-status");
const aiStatus = require("./api/ai-status");
const avTriage = require("./api/av-triage");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "bob-api-routes",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) return next();
          if (req.url.startsWith("/api/youtube-search")) return youtubeSearch(req, res);
          if (req.url.startsWith("/api/youtube-status")) return youtubeStatus(req, res);
          if (req.url.startsWith("/api/ai-status")) return aiStatus(req, res);
          if (req.url.startsWith("/api/av-triage")) return avTriage(req, res);
          return next();
        });
      },
    },
  ],
});
