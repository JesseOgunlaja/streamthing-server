import "dotenv/config";
import uWS from "uWebSockets.js";
import { setupRoutes } from "./routes.js";
import { setupServer } from "./setup.js";
import { setupSocketHandlers } from "./sockets.js";
import type { AppState } from "./types";

const appState: AppState = {
  serversCache: {},
  usersCache: {},
  usage: {},
  app: uWS.App(),
};

setupServer(appState);
setupRoutes(appState);
setupSocketHandlers(appState);

const PORT = Number(process.env.PORT) || 5000;
appState.app.listen("0.0.0.0", PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
