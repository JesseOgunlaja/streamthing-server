import { HttpRequest } from "uWebSockets.js";
import { initialUsage, planLimits } from "./constants.js";
import type { AppState, WS } from "./types";
import {
  decodeJWT,
  fetchServer,
  fetchUser,
  getUserConnections,
  parseJsonBody,
  sendJsonResponse,
  sendWs,
  updateServerUsage,
  wrapAsyncRoute,
} from "./utils.js";

export function setupSocketHandlers(appState: AppState): void {
  const { app } = appState;

  app.ws("/*", {
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 120,
    maxBackpressure: 64 * 1024,

    upgrade: (res, req: HttpRequest, context) => {
      const serverId = new URLSearchParams(req.getQuery()).get("id") || "";

      res.upgrade(
        { serverId, authenticated: false },
        req.getHeader("sec-websocket-key"),
        req.getHeader("sec-websocket-protocol"),
        req.getHeader("sec-websocket-extensions"),
        context
      );
    },

    message: async (ws: WS, message: ArrayBuffer) => {
      try {
        const data = JSON.parse(Buffer.from(message).toString());
        if (data.type === "authenticate") {
          handleAuthentication(ws, data.token, appState);
        }
      } catch (error) {
        sendWs(ws, {
          type: "error",
          message:
            error instanceof Error ? error.message : "Invalid message format",
        });
      }
    },

    close: (ws: WS) => {
      const { authenticated, serverId } = ws.getUserData();
      if (authenticated) {
        updateServerUsage(appState, serverId, "connections", -1);
      }
    },
  });

  app.post(
    "/emit-message",
    wrapAsyncRoute(async (res) => {
      try {
        const { usage, app } = appState;
        const { id, password, channel, event, message } = await parseJsonBody(
          res
        );

        const server = await fetchServer(appState, id);
        if (!server || server.password !== password) {
          throw new Error("Invalid credentials");
        }

        const user = await fetchUser(appState, server.owner);
        if (!user) throw new Error("User not found");

        const userUsageData = usage[user.email] || initialUsage;
        const userPlanLimits = planLimits[user.plan];
        if (userUsageData.messages >= userPlanLimits.messages) {
          throw new Error("Message limit exceeded");
        }

        const messageSize = JSON.stringify(message).length;
        updateServerUsage(appState, server.id, "dataTransfer", messageSize);
        updateServerUsage(appState, server.id, "messages");

        app.publish(
          `${id}-${channel}`,
          JSON.stringify({
            type: "message",
            event,
            payload: message,
          })
        );

        sendJsonResponse(res, { message: "Message emitted successfully" });
      } catch (error) {
        sendJsonResponse(
          res,
          { error: error instanceof Error ? error.message : "Unknown error" },
          400
        );
      }
    })
  );
}

async function handleAuthentication(
  ws: WS,
  token: string,
  appState: AppState
): Promise<void> {
  const data = ws.getUserData();

  try {
    if (!token) throw Error;

    const server = await fetchServer(appState, data.serverId);
    if (!server) throw Error;

    const { channel } = await decodeJWT(token, server.password);

    const user = await fetchUser(appState, server.owner);
    if (!user) throw Error;

    const userConnections = await getUserConnections(user, appState);
    if (userConnections >= planLimits[user.plan].connections) {
      throw new Error("Connection limit exceeded");
    }

    updateServerUsage(appState, data.serverId, "connections");

    data.roomKey = `${data.serverId}-${channel}`;
    data.server = server;
    data.authenticated = true;
    ws.subscribe(data.roomKey);
  } catch (error) {
    sendWs(ws, {
      type: "error",
      message: error instanceof Error ? error.message : "Invalid credentials",
    });
  }
}
