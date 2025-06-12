import { readLastAttempt } from "./attempt.js";
import { config } from "./config.js";
import { writeCookieValue } from "./cookie-file.js";
import { setMamSeedboxIp, setNowAndScheduleNext } from "./mam.js";

Bun.serve({
  port: config.port,
  routes: {
    "/status": async () => {
      const lastAttempt = await readLastAttempt();
      return Response.json(lastAttempt, {
        status: lastAttempt.success ? 200 : 500,
      });
    },

    "/update-ip": async () => {
      const attempt = await setMamSeedboxIp();
      return Response.json(attempt);
    },

    "/set-cookie": {
      PUT: async (request) => {
        const cookieValue = await request.text();
        if (!cookieValue) {
          return new Response("Cookie value is required", { status: 400 });
        }
        writeCookieValue(cookieValue);
        return Response.json({ message: "Cookie value updated" });
      },
    },
  },

  fetch() {
    return new Response("Not Found", { status: 404 });
  },

  error(error) {
    return Response.json(
      {
        error: "Unhandled error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  },
});
console.log(`Server running on http://localhost:${config.port}`);

console.log("Starting background task to update seedbox IP...");
setNowAndScheduleNext();
