import { planLimits } from "./constants";
import { AppState } from "./types";
import {
  decodeJWT,
  fetchServer,
  fetchUser,
  getInitialUsage,
  hashString,
  updateServerUsage,
} from "./utils";

export function setupSocketHandlers(appState: AppState) {
  const { hono, usage, io } = appState;

  io.on("connection", (socket) => {
    socket.on("authenticate", async (token) => {
      try {
        if (!token) throw new Error("Invalid credentials");

        const decodedToken = await decodeJWT(token);
        if (typeof decodedToken?.id !== "string") throw Error();

        const server = await fetchServer(appState, decodedToken.id);
        if (!server) throw Error();

        const JWT_KEY = `${socket.id}-${server.password}`;
        const { id, channel } = (await decodeJWT(token, JWT_KEY))!;

        if (id !== decodedToken.id) throw Error();
        const roomKey = hashString(`${id}-${channel}`);

        socket.data.authenticated = true;
        socket.join(roomKey);
      } catch {
        return socket.emit("auth_error", "Invalid credentials");
      }
    });
    socket.on("disconnect", () => {
      if (!socket.data.authenticated) return;
      updateServerUsage(appState, socket.data.id, "connections", -1);
    });
  });

  hono.post("/emit-event", async (c) => {
    const { id, event, msg, channel, password } = await c.req.json();

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
    io.to(roomKey).emit(hashString(event), msg);

    return c.json({ message: "Event emitted successfully" });
  });
}
