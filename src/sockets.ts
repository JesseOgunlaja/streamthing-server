import { createHmac, randomBytes } from "crypto";
import { planLimits } from "./constants";
import {
  AppState,
  GenericObject,
  Server as ServerType,
  UserType,
} from "./types";
import {
  encryptValue,
  fetchServer,
  fetchUser,
  getInitialUsage,
  hashString,
  updateServerUsage,
} from "./utils";

const activeSessions = new Map();
const pendingConnections = new Map();

export function setupSocketHandlers(appState: AppState) {
  const { hono, usage, io } = appState;

  io.use(async (socket, next) => {
    try {
      const { id, channel } = socket.handshake.query as GenericObject;

      if (!id || !channel) return next(new Error("Invalid params"));
      const server = (await fetchServer(appState, id)) as ServerType;
      const user = (await fetchUser(appState, server.owner)) as UserType;
      const userUsageData = usage[server.owner] || getInitialUsage();
      const userPlanLimits = planLimits[user.plan];

      if (!user || !server) {
        return next(new Error("Invalid credentials"));
      }

      if (userUsageData.connections >= userPlanLimits.connections) {
        return next(new Error("Connection limit exceeded"));
      }

      socket.data.id = id;
      socket.data.channel = channel;
      socket.data.authenticated = false;
      next();
    } catch (error) {
      console.log(error);
      next(new Error(`${error}`));
    }
  });

  io.on("connection", (socket) => {
    const sid = socket.id;

    socket.on("challenge", async (id) => {
      const server = await fetchServer(appState, id);
      if (!server) return;

      const challenge = randomBytes(32).toString("hex");
      const expectedResponse = createHmac("sha256", server.password)
        .update(challenge)
        .digest("hex");
      pendingConnections.set(id, expectedResponse);

      socket.emit("challenge-response", challenge);
    });

    socket.on("authenticate", async (credentials) => {
      const { id, channel, challenge } = credentials;
      if (pendingConnections.get(id) !== challenge) {
        return socket.emit("auth_error", "Invalid challenge response");
      }
      pendingConnections.delete(id);

      const sessionToken = randomBytes(32).toString("hex");
      activeSessions.set(sid, { id, sessionToken });

      const server = (await fetchServer(appState, id)) as ServerType;
      updateServerUsage(appState, server.id, "connections");
      updateServerUsage(appState, server.id, "connectionsToday");

      socket.data.authenticated = true;

      const roomKey = hashString(`${id}-${channel}`);
      socket.join(roomKey);
    });

    socket.on("disconnect", async () => {
      if (socket.data.authenticated) {
        const session = activeSessions.get(sid);
        if (session) {
          const server = (await fetchServer(
            appState,
            session.id
          )) as ServerType;
          updateServerUsage(appState, server.id, "connections", -1);
        }
        activeSessions.delete(sid);
      }
    });

    // Middleware for authenticated routes
    socket.use((packet, next) => {
      if (
        socket.data.authenticated ||
        packet[0] === "challenge" ||
        packet[0] === "authenticate"
      ) {
        next();
      } else {
        next(new Error("Not authenticated"));
      }
    });
  });

  // New endpoint for challenge-response
  hono.post("/challenge", async (c) => {
    const { id } = await c.req.json();
    const server = await fetchServer(appState, id);
    if (!server) {
      return c.json({ error: "Invalid server ID" }, 401);
    }

    const challenge = randomBytes(32).toString("hex");
    const expectedResponse = createHmac("sha256", server.password)
      .update(challenge)
      .digest("hex");
    pendingConnections.set(id, expectedResponse);

    return c.json({ challenge });
  });

  hono.post("/emit-event", async (c) => {
    const { id, event, msg, channel, password, encryptionKey } =
      await c.req.json();

    if (!id || !event || !channel || !msg || !password) {
      return c.json({ message: "Invalid params" }, 422);
    }

    const server = await fetchServer(appState, id);
    const user = await fetchUser(appState, server.owner);

    const userUsageData = usage[server.owner] || getInitialUsage();
    const userPlanLimits = planLimits[user.plan];

    if (server.password !== password) {
      return c.json({ message: "Invalid credentials" }, 401);
    }

    if (userUsageData.messages >= userPlanLimits.messages) {
      return c.json({ message: "Message limit exceeded" }, 401);
    }

    const messageSize = JSON.stringify(msg).length;

    updateServerUsage(appState, server.id, "dataTransfer", messageSize);
    updateServerUsage(appState, server.id, "messages");

    const roomKey = hashString(`${id}-${channel}`);
    const newMsg = encryptionKey ? encryptValue(msg, encryptionKey) : msg;
    io.to(roomKey).emit(hashString(event), newMsg);

    return c.json({ message: "Event emitted successfully" });
  });
}
