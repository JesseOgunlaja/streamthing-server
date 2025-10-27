import { schedule } from "node-cron";
import type { AppState } from "./types";
import { kv } from "./utils.js";

export function setupServer(state: AppState): void {
	const { app, usersCache, serversCache, disabled } = state;

	app.options("/*", (res) => {
		res
			.writeHeader("Access-Control-Allow-Origin", "*")
			.writeHeader(
				"Access-Control-Allow-Methods",
				"GET, POST, OPTIONS, PUT, DELETE",
			)
			.writeHeader(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization",
			)
			.writeHeader("Access-Control-Max-Age", "86400")
			.end();
	});

	app.any("/*", (res, req) => {
		res.cork(() => {
			res.writeHeader("Access-Control-Allow-Origin", "*");
			res.end();
		});
	});

	schedule("*/30 * * * *", () => {
		Object.keys(usersCache).forEach((key) => delete usersCache[key]);
		Object.keys(serversCache).forEach((key) => delete serversCache[key]);
	});

	schedule("0 0 * * *", async () => {
		await kv.usage.flushdb();
		disabled.clear();
	});
}
