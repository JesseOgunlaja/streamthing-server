import { randomUUID } from "crypto";
import { initialUsage, planLimits } from "./constants.ts";
import type { AppState, Server, WS } from "./types.ts";
import {
  decodeJWT,
  fetchServer,
  fetchUser,
  getUserConnections,
  parseJsonBody,
  sendJsonResponse,
  sendWs,
  updateServerUsage,
} from "./utils.ts";

export function setupSocketHandlers(appState: AppState): void {
  const { app, activeConnections } = appState;

  app.ws("/*", {
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 120,
    maxBackpressure: 64 * 1024,

    open: (ws: WS) => {
      const data = ws.getUserData();
      data.authenticated = false;

      const connectionId = randomUUID();
      data.connectionId = connectionId;
      activeConnections.set(connectionId, ws);
      sendWs(ws, { type: "connection_id", id: connectionId });
    },

    message: async (ws: WS, message: ArrayBuffer) => {
      try {
        const data = JSON.parse(Buffer.from(message).toString());

        if (data.type === "authenticate") {
          handleAuthentication(ws, data.token, appState);
        } else if (data.type === "emit_event") {
          const { server, roomKey } = ws.getUserData();
          const { event, message: payload } = data.data;

          await emitMessage(appState, server, roomKey, event, payload);
        }
      } catch (error) {
        sendWs(ws, { type: "error", message: "Invalid message format" });
      }
    },

    close: (ws: WS) => {
      const { connectionId, authenticated, server } = ws.getUserData();
      if (connectionId) activeConnections.delete(connectionId);
      if (authenticated && server)
        updateServerUsage(appState, server.id, "connections", -1);
    },
  });

  app.post("/emit-message", async (res) => {
    try {
      const body = await parseJsonBody(res);
      const { id, password, channel, event, message } = body;
      const roomKey = `${id}-${channel}`;

      const server = await fetchServer(appState, id);
      if (!server || server.password !== password) {
        throw new Error("Invalid credentials");
      }

      await emitMessage(appState, server, roomKey, event, message);

      sendJsonResponse(res, { message: "Message emitted successfully" });
    } catch (error: unknown) {
      sendJsonResponse(res, { error: error || "Unknown error" }, 400);
    }
  });
}

async function emitMessage(
  appState: AppState,
  server: Server,
  roomKey: string,
  event: string,
  message: string
) {
  const { usage, app } = appState;
  if (!event || message === undefined) throw new Error("Invalid params");

  const user = await fetchUser(appState, server.owner);
  const userUsageData = usage[user.email] || initialUsage;
  const userPlanLimits = planLimits[user.plan];

  if (userUsageData.messages >= userPlanLimits.messages) {
    throw new Error("Message limit exceeded");
  }

  const messageSize = JSON.stringify(message).length;

  updateServerUsage(appState, server.id, "dataTransfer", messageSize);
  updateServerUsage(appState, server.id, "messages");

  app.publish(
    roomKey,
    JSON.stringify({
      type: "message",
      event,
      payload: message,
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

    const decodedToken = await decodeJWT(token);
    if (typeof decodedToken?.id !== "string") throw Error;

    const server = await fetchServer(appState, decodedToken.id);
    if (!server || server.region !== process.env.REGION) throw Error;

    const JWT_KEY = `${data.connectionId}-${server.password}`;
    const { id, channel } = await decodeJWT(token, JWT_KEY);

    if (id !== decodedToken.id) throw Error;

    const user = await fetchUser(appState, server.owner);
    const userConnections = await getUserConnections(user, appState);
    if (userConnections >= planLimits[user.plan].connections) {
      throw new Error("Connection limit exceeded");
    }

    updateServerUsage(appState, id, "connections");

    data.server = server;
    data.authenticated = true;

    const roomKey = `${id}-${channel}`;
    data.roomKey = roomKey;
    ws.subscribe(roomKey);
  } catch (error) {
    sendWs(ws, {
      type: error ? "error" : "auth_error",
      message: error || "Invalid credentials",
    });
  }
}
