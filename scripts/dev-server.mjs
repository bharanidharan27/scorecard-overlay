import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const port = 1420;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function resolvePath(urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  return path.normalize(path.join(root, safePath));
}

const server = http.createServer(async (req, res) => {
  const requestPath = resolvePath(req.url || "/");

  if (!requestPath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(requestPath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const fileStats = await stat(requestPath);
  if (fileStats.isDirectory()) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const extension = path.extname(requestPath);
  res.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream"
  });

  createReadStream(requestPath).pipe(res);
});

server.listen(port, () => {
  console.log(`Scorecard overlay dev server running at http://localhost:${port}`);
});
