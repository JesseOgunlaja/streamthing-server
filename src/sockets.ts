import { HttpRequest } from "uWebSockets.js";
import { planLimits } from "./constants.js";
import type { AppState, WS } from "./types.js";
import {
	decodeJWT,
	fetchServer,
	fetchUser,
	getAllUserUsage,
	getUsage,
	kv,
	ratelimit,
	sendWs,
} from "./utils.js";

export function setupSocketHandlers(appState: AppState): void {
	const { app, disabled } = appState;

	app.ws("/*", {
		maxPayloadLength: 16 * 1024 * 1024,
		idleTimeout: 120,
		maxBackpressure: 64 * 1024,

		upgrade: (res, req: HttpRequest, context) => {
			const ip = Buffer.from(res.getRemoteAddressAsText()).toString();
			const serverId = new URLSearchParams(req.getQuery()).get("id") || "";

			res.upgrade(
				{ serverId, ip },
				req.getHeader("sec-websocket-key"),
				req.getHeader("sec-websocket-protocol"),
				req.getHeader("sec-websocket-extensions"),
				context,
			);
		},

		message: async (ws: WS, message: ArrayBuffer) => {
			const data = JSON.parse(Buffer.from(message).toString());
			if (data.type === "emit") {
				const { serverAuthenticated, serverId, server } = ws.getUserData();
				if (!serverAuthenticated) {
					return sendWs(ws, {
						type: "error",
						message: "Unauthorized",
					});
				}

				if (disabled.has(server.owner)) {
					return sendWs(ws, {
						type: "error",
						message: "Limit exceeded",
					});
				}

				app.publish(
					`${serverId}-${data.channel}`,
					JSON.stringify({
						type: "message",
						event: data.event,
						payload: data.message,
					}),
				);

				queueMicrotask(async () => {
					try {
						const user = await fetchUser(appState, server.owner);
						if (!user) throw Error;

						const userMessages = await getAllUserUsage(user!, "messages");

						const userPlanLimits = planLimits[user!.plan];
						if (userMessages >= userPlanLimits.messages) {
							disabled.add(server.owner);
							throw new Error("Limit exceeded");
						}

						const usage = await getUsage(serverId);
						const messageSize = Buffer.byteLength(message);

						const pipeline = kv.usage.pipeline();

						pipeline.hincrby(serverId, "messages", 1);
						pipeline.hincrby(serverId, "dataTransfer", messageSize);

						if (messageSize > usage.maxMessageSize) {
							pipeline.hset(serverId, "maxMessageSize", messageSize.toString());
						}

						await pipeline.exec();
					} catch (error) {
						sendWs(ws, {
							type: "error",
							message:
								error instanceof Error ? error.message : "Invalid credentials",
						});
						ratelimit(appState, ws.getUserData().ip, ws);
					}
				});
			} else if (data.type === "authenticate") {
				try {
					await handleAuthentication(ws, data.token, appState);
				} catch (error) {
					sendWs(ws, {
						type: "error",
						message:
							error instanceof Error ? error.message : "Invalid credentials",
					});
					ratelimit(appState, ws.getUserData().ip, ws);
				}
			} else if (data.type === "server-authenticate") {
				try {
					const server = await fetchServer(appState, data.serverId);
					if (!server || server.password !== data.password) throw Error;

					if (disabled.has(server.owner)) {
						throw new Error("Limit exceeded");
					}

					sendWs(ws, {
						type: "server-authenticated",
					});

					ws.getUserData().serverAuthenticated = true;
					ws.getUserData().server = server;
					ws.getUserData().serverId = server.id;
				} catch (error) {
					sendWs(ws, {
						type: "error",
						message:
							error instanceof Error ? error.message : "Invalid credentials",
					});
					ratelimit(appState, ws.getUserData().ip, ws);
				}
			}
		},

		close: (ws: WS) => {
			const { authenticated, serverId } = ws.getUserData();
			if (authenticated) kv.usage.hincrby(serverId, "connections", -1);
		},
	});
}

async function handleAuthentication(
	ws: WS,
	token: string,
	appState: AppState,
): Promise<void> {
	const data = ws.getUserData();

	if (!token) throw Error;

	const server = await fetchServer(appState, data.serverId);
	if (!server) throw Error;

	if (appState.disabled.has(server.owner)) {
		throw new Error("Limit exceeded");
	}

	const { channel } = await decodeJWT(token, server.password);

	fetchUser(appState, server.owner).then(async (user) => {
		if (!user) throw Error;

		const userConnections = await getAllUserUsage(user, "connections");
		if (userConnections >= planLimits[user.plan].connections) {
			appState.disabled.add(server.owner);
		}
	});

	getUsage(server.id).then(async (usage) => {
		const pipeline = kv.usage.pipeline();

		pipeline.hincrby(server.id, "connections", 1);
		pipeline.hincrby(server.id, "connectionsToday", 1);

		if (usage.connections + 1 > usage.peakConnections) {
			pipeline.hset(server.id, "peakConnections", usage.connections + 1);
		}

		await pipeline.exec();
	});

	data.roomKey = `${data.serverId}-${channel}`;
	data.server = server;
	data.authenticated = true;
	ws.subscribe(data.roomKey);
}
