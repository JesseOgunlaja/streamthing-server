import { initialUsage } from "./constants.js";
import type { AppState } from "./types";
import { fetchServer, sendJsonResponse, wrapAsyncRoute } from "./utils.js";

export function setupRoutes(appState: AppState): void {
  const { app, usage } = appState;

  app.get(
    "/get-server/:id",
    wrapAsyncRoute(async (res, req) => {
      const id = req.getParameter(0);
      const password = req.getHeader("authorization");
      if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

      const server = await fetchServer(appState, id);
      if (!server || server.password !== password) {
        return sendJsonResponse(res, { message: "Unauthorized" }, 401);
      }

      return sendJsonResponse(res, { usage: usage[id] || initialUsage });
    })
  );

  app.post(
    "/reset-server-cache/:id",
    wrapAsyncRoute(async (res, req) => {
      const id = req.getParameter(0);
      const password = req.getHeader("authorization");
      if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

      const server = await fetchServer(appState, id);
      if (!server || server.password !== password) {
        return sendJsonResponse(res, { message: "Unauthorized" }, 401);
      }

      delete appState.serversCache[`server-${id}`];
      return sendJsonResponse(res, { message: "Server cache reset" });
    })
  );

  app.post("/reset-user-cache/:id", (res, req) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    delete appState.usersCache[`user-${id}`];
    return sendJsonResponse(res, { message: "User cache reset" });
  });

  app.get("/ping", (res) => {
    return sendJsonResponse(res, { message: "Successful ping" });
  });
}
