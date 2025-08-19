import { initialUsage } from "./constants.ts";
import type { AppState } from "./types";
import { fetchServer, sendJsonResponse } from "./utils.ts";

export function setupRoutes(appState: AppState): void {
  const { app, usage } = appState;

  app.get("/get-server/:id", async (res: any, req: any) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    const server = await fetchServer(appState, id);
    if (server.password !== req.getHeader("authorization")) {
      return sendJsonResponse(res, { message: "Unauthorized" }, 401);
    }

    return sendJsonResponse(res, { usage: usage[id] || initialUsage });
  });

  app.post("/reset-server-cache/:id", async (res: any, req: any) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    const server = await fetchServer(appState, id);
    if (server.password !== req.getHeader("authorization")) {
      return sendJsonResponse(res, { message: "Unauthorized" }, 401);
    }

    resetServerCache(appState, id);
    return sendJsonResponse(res, { message: "Server cache reset" });
  });

  app.post("/reset-user-cache/:id", async (res: any, req: any) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    resetUserCache(appState, id);
    return sendJsonResponse(res, { message: "User cache reset" });
  });

  app.get("/ping", async (res: any) => {
    return sendJsonResponse(res, { message: "Successful ping" });
  });
}

function resetServerCache(state: AppState, id: string): void {
  const { serversCache } = state;
  delete serversCache[`server-${id}`];
}

function resetUserCache(state: AppState, id: string): void {
  const { usersCache } = state;
  delete usersCache[`user-${id}`];
}
