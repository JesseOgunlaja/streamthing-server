import type { AppState } from "./types.js";
import { env, getUsage, sendJsonResponse, wrapAsyncRoute } from "./utils.js";

export function setupRoutes(appState: AppState) {
	const { app } = appState;

	app.get(
		"/get-server/:id",
		wrapAsyncRoute(async (res, req) => {
			const id = req.getParameter(0);
			const password = req.getHeader("authorization");
			if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

			if (password !== env.ADMIN_PASSWORD) {
				return sendJsonResponse(res, { message: "Unauthorized" }, 401);
			}

			return sendJsonResponse(res, { usage: await getUsage(id) });
		}),
	);

	app.post("/reset-server-cache/:id", (res, req) => {
		const id = req.getParameter(0);
		const password = req.getHeader("authorization");
		if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

		if (password !== env.ADMIN_PASSWORD) {
			return sendJsonResponse(res, { message: "Unauthorized" }, 401);
		}

		delete appState.serversCache[`server-${id}`];
		return sendJsonResponse(res, { message: "Server cache reset" });
	});

	app.post("/reset-user-cache/:id", (res, req) => {
		const id = req.getParameter(0);
		const password = req.getHeader("authorization");
		if (!id) return sendJsonResponse(res, { message: "Invalid params" }, 422);

		if (password !== env.ADMIN_PASSWORD) {
			return sendJsonResponse(res, { message: "Unauthorized" }, 401);
		}

		delete appState.usersCache[`user-${id}`];
		return sendJsonResponse(res, { message: "User cache reset" });
	});

	app.get("/ping", (res) => {
		return sendJsonResponse(res, { message: "Successful ping" });
	});
}
