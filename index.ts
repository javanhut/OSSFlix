import index from "./index.html";
import { readTomlFile } from "./scripts/tomlreader";

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
    "/tvshows": index,
    "/movies": index,
    "/api/media": {
      async GET(req) {
        const url = new URL(req.url);
        const filePath = url.searchParams.get("path");
        if (!filePath) {
          return Response.json({ error: "Missing path parameter" }, { status: 400 });
        }
        const data = await readTomlFile(filePath);
        return Response.json(data);
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});
