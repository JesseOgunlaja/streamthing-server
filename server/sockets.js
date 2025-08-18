import { initialUsage, planLimits } from "./constants.js";
import {
  decodeJWT,
  fetchServer,
  fetchUser,
  getUserConnections,
  parseJsonBody,
  sendJsonResponse,
  sendWs,
  updateServerUsage,
} from "./utils.js";

export function setupSocketHandlers(appState) {
  const { app, activeConnections } = appState;

  app.ws("/*", {
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 120,
    maxBackpressure: 64 * 1024,

    open: (ws) => {
      ws.authenticated = false;
      ws.server = null;
      ws.roomKey = null;

      const connectionId = crypto.randomUUID();
      ws.connectionId = connectionId;
      activeConnections.set(connectionId, ws);
      sendWs(ws, { type: "connection_id", id: connectionId });
    },

    message: async (ws, message) => {
      try {
        const data = JSON.parse(Buffer.from(message).toString());

        if (data.type === "authenticate") {
          handleAuthentication(ws, data.token, appState);
        } else if (data.type === "emit_event") {
          const { event, message } = data.data;
          await emitMessage(appState, ws.server, ws.roomKey, event, message);
        }
      } catch (error) {
        sendWs(ws, { type: "error", message: "Invalid message format" });
      }
    },

    close: (ws) => {
      if (ws.connectionId) activeConnections.delete(ws.connectionId);
      if (ws.authenticated && ws.server) {
        updateServerUsage(appState, ws.server.id, "connections", -1);
      }
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
    } catch (error) {
      sendJsonResponse(res, { error: error.message || "Unknown error" }, 400);
    }
  });
}

async function emitMessage(appState, server, roomKey, event, message) {
  const { usage, app } = appState;
  if (!event || !message) throw new Error("Invalid params");

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

async function handleAuthentication(ws, token, appState) {
  try {
    if (!token) throw Error;

    const decodedToken = await decodeJWT(token);
    if (typeof decodedToken?.id !== "string") throw Error;

    const server = await fetchServer(appState, decodedToken.id);
    if (!server || server.region !== process.env.REGION) throw Error;

    const JWT_KEY = `${ws.connectionId}-${server.password}`;
    const { id, channel } = await decodeJWT(token, JWT_KEY);

    if (id !== decodedToken.id) throw Error;

    const user = await fetchUser(appState, server.owner);
    const userConnections = await getUserConnections(user, appState);
    if (userConnections >= planLimits[user.plan].connections) {
      throw new Error("Connection limit exceeded");
    }

    const roomKey = `${id}-${channel}`;
    updateServerUsage(appState, id, "connections");

    ws.server = server;
    ws.authenticated = true;
    ws.roomKey = roomKey;
    ws.subscribe(roomKey);
  } catch (error) {
    sendWs(ws, {
      type: "auth_error",
      message: error.message || "Invalid credentials",
    });
  }
}
