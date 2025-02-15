import { AppState } from "./types";
import { fetchServer, getInitialUsage } from "./utils";

export function setupRequestHandlers(appState: AppState) {
  const { hono, usage } = appState;

  hono.get("/get-server/:id", async (c) => {
    const id = c.req.param("id");

    if (id === "932") return c.json({ message: "Cron job success" }, 200);

    const password = c.req.header("Authorization");
    if (!id || !password) return c.json({ message: "Invalid params" }, 422);

    const server = await fetchServer(appState, id);
    if (password !== server.password) return c.json({}, 401);

    return c.json({ usage: usage[id] || getInitialUsage() });
  });

  hono.post("/reset-server-cache/:id", async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ message: "Invalid params" }, 422);
    const server = await fetchServer(appState, id);
    if (server.password !== c.req.header("Authorization"))
      return c.json({ message: "Unauthorized" }, 401);
    resetServerCache(appState, id);
    return c.json({ message: "Server cache reset" });
  });

  hono.post("/reset-user-cache/:id", async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ message: "Invalid params" }, 422);
    resetUserCache(appState, id);
    return c.json({ message: "User cache reset" });
  });
}

function resetServerCache(state: AppState, id: string) {
  const { serversCache } = state;
  delete serversCache[`server-${id}`];
}

function resetUserCache(state: AppState, id: string) {
  const { usersCache } = state;
  delete usersCache[`user-${id}`];
}
