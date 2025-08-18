import "dotenv/config";
import uWS from "uWebSockets.js";
import { setupRoutes } from "./routes.js";
import { setupServer } from "./setup.js";
import { setupSocketHandlers } from "./sockets.js";

const appState = {
  serversCache: {},
  usersCache: {},
  usage: {},
  app: null,
  activeConnections: new Map(),
};

const app = uWS.App();
appState.app = app;

setupServer(appState);
setupRoutes(appState);
setupSocketHandlers(appState);

const PORT = process.env.PORT || 5000;
app.listen("0.0.0.0", PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
