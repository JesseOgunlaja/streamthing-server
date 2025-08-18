import { initialUsage } from "./constants.js";
import { fetchServer, sendJsonResponse } from "./utils.js";

export function setupRoutes(appState) {
  const { app, usage } = appState;

  app.get("/get-server/:id", async (res, req) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    const server = await fetchServer(appState, id);
    if (!server.password !== req.getHeader("authorization")) {
      return sendJsonResponse(res, { message: "Unauthorized" }, 401);
    }

    return sendJsonResponse(res, { usage: usage[id] || initialUsage });
  });

  app.post("/reset-server-cache/:id", async (res, req) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    const server = await fetchServer(appState, id);
    if (server.password !== req.getHeader("authorization")) {
      return sendJsonResponse(res, { message: "Unauthorized" }, 401);
    }

    resetServerCache(appState, id);
    return sendJsonResponse(res, { message: "Server cache reset" });
  });

  app.post("/reset-user-cache/:id", async (res, req) => {
    const id = req.getParameter(0);
    if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

    resetUserCache(appState, id);
    return sendJsonResponse(res, { message: "User cache reset" });
  });

  app.get("/ping", async (res) => {
    return sendJsonResponse(res, { message: "Successful ping" });
  });
}

function resetServerCache(state, id) {
  const { serversCache } = state;
  delete serversCache[`server-${id}`];
}

function resetUserCache(state, id) {
  const { usersCache } = state;
  delete usersCache[`user-${id}`];
}
