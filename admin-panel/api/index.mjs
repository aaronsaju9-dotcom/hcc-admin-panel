import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const handleRequest = require("../server.js");

export default function handler(request, response) {
  const url = new URL(request.url, "http://localhost");
  const route = url.searchParams.get("path");
  if (route !== null) {
    // Keep ordinary endpoint query parameters while removing only Vercel's route key.
    url.searchParams.delete("path");
    const pathname = route.startsWith("/") ? route : "/" + route;
    const query = url.searchParams.toString();
    request.url = pathname + (query ? "?" + query : "");
  }
  return handleRequest(request, response);
}
