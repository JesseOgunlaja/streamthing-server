import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Server as SocketIOServer } from "socket.io";
import { setupRequestHandlers } from "./requests";
import { setupServer } from "./setup";
import { setupSocketHandlers } from "./sockets";
import { AppState } from "./types";

const app = new Hono();

// @ts-ignore
const appState: AppState = {
  serversCache: {},
  usersCache: {},
  usage: {},
  hono: app,
};

setupServer(appState);
setupRequestHandlers(appState);

const server = serve({
  hostname: "0.0.0.0",
  fetch: app.fetch,
  port: 5000,
});

const io = new SocketIOServer(server, {
  transports: ["websocket"],
});
appState.io = io;

setupSocketHandlers(appState);

console.log(`Listening on port ${process.env.PORT}`);
