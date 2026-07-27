import { createRequire } from "module";

const require = createRequire(import.meta.url);
const handleRequest = require("../server.js");

export default function handler(request, response) {
  return handleRequest(request, response);
}
