import "dotenv/config";
import uWS from "uWebSockets.js";
import { setupRoutes } from "./routes.js";
import { setupServer } from "./setup.js";
import { setupSocketHandlers } from "./sockets.js";
import type { AppState } from "./types";
import { env } from "./utils.js";

const appState: AppState = {
	serversCache: {},
	usersCache: {},
	app: uWS.App(),
	disabled: new Set<string>(),
	ratelimit: new Map(),
};

setupServer(appState);
setupRoutes(appState);
setupSocketHandlers(appState);

const PORT = Number(env.PORT) || 5000;
appState.app.listen("0.0.0.0", PORT, () => {
	console.log(`Listening on port ${PORT}`);
});
