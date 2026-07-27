import { createRequire } from "module";

const require = createRequire(import.meta.url);
const handleRequest = require("../admin-panel/server.js");

export default function handler(request, response) {
  return handleRequest(request, response);
}
