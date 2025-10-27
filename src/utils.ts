import { HttpRequest, HttpResponse } from "uWebSockets.js";
import { Redis } from "@upstash/redis";
import ioredis from "ioredis";
import { decodeJwt, jwtVerify } from "jose";
import { initialUsage, serversByRegion } from "./constants.js";
import type { AppState, ENV, Server, Usage, User, WS } from "./types";

export const env = process.env as unknown as ENV;

export const kv = {
	main: new Redis({
		url: env.UPSTASH_REDIS_URL,
		token: env.UPSTASH_REDIS_TOKEN,
	}),
	usage: new ioredis({
		host: "redis",
		port: 6379,
		password: env.REDIS_PASSWORD,
	}),
};

export async function fetchFromCache<T extends "usersCache" | "serversCache">(
	state: AppState,
	key: T,
	dataKey: string,
): Promise<null | (T extends "usersCache" ? User : Server)> {
	type ReturnType = T extends "usersCache" ? User : Server;
	const cache = state[key];
	if (cache[dataKey]) return cache[dataKey] as ReturnType;

	const fetchedValue = (await kv.main.json.get(dataKey)) as ReturnType;
	if (!fetchedValue) return null;

	cache[dataKey] = fetchedValue;
	return fetchedValue;
}

export async function getUsage(id: string): Promise<Usage> {
	const dbUsage = await kv.usage.hgetall(id);
	if (Object.keys(dbUsage).length === 0) {
		await kv.usage.hset(id, initialUsage);
		return initialUsage;
	}

	const usage = {} as Usage;
	for (const key in dbUsage) {
		usage[key as keyof Usage] = Number(dbUsage[key]);
	}

	return usage;
}

export async function fetchUser(state: AppState, userEmail: string) {
	return await fetchFromCache(state, "usersCache", `user-${userEmail}`);
}

export async function fetchServer(state: AppState, serverID: string) {
	return await fetchFromCache(state, "serversCache", `server-${serverID}`);
}

export async function decodeJWT<T extends string | undefined>(
	token: string,
	secret?: T,
): Promise<
	T extends string
		? { id: string; channel: string }
		: { id: string; channel: string } | undefined
> {
	if (secret) {
		const secretBuffer = new TextEncoder().encode(secret);
		const { payload } = await jwtVerify(token, secretBuffer);
		return payload as { id: string; channel: string };
	} else {
		return decodeJwt(token);
	}
}

export async function getAllUserUsage(
	user: User,
	key: keyof Pick<Usage, "connections" | "messages">,
) {
	return (
		await Promise.all(
			user.servers.map(async (server) => {
				if (server.region === env.REGION) return await getUsage(server.id);

				const res = await fetch(
					`${serversByRegion[server.region]}/get-server/${server.id}`,
					{
						headers: {
							authorization: server.password,
						},
					},
				);

				return res.json();
			}),
		)
	).reduce(
		(total: number, data: Usage | null) => total + (data?.[key] || 0),
		0,
	);
}

export function sendJsonResponse(
	res: HttpResponse,
	data: unknown,
	status = 200,
) {
	res.cork(() => {
		res.writeStatus(`${status}`);
		res.writeHeader("Content-Type", "application/json");
		res.end(JSON.stringify(data));
	});
}

export function sendWs(ws: WS, data: Record<string, unknown>) {
	ws.send(JSON.stringify(data));
}

export function parseJsonBody(
	res: HttpResponse,
): Promise<Record<string, string>> {
	return new Promise((resolve, reject) => {
		let buffer = Buffer.alloc(0);
		let totalSize = 0;
		const maxBodySize = 4 * 1024 * 1024;

		res.onData((chunk: ArrayBuffer, isLast: boolean) => {
			if (res.aborted) {
				reject(new Error("Request aborted"));
				return;
			}

			if (chunk.byteLength > 0) {
				const copy = copyArrayBuffer(chunk);
				totalSize += copy.byteLength;
				buffer = Buffer.concat([buffer, Buffer.from(copy)]);
			}

			if (totalSize > maxBodySize) {
				reject(new Error("Request body too large"));
				return;
			}

			if (isLast) {
				try {
					const body = buffer.length > 0 ? JSON.parse(buffer.toString()) : {};
					resolve(body);
				} catch (err: any) {
					reject(new Error(`Failed to parse JSON: ${err.message}`));
				}
			}
		});

		res.onAborted(() => {
			reject(new Error("Request aborted"));
		});
	});
}

function copyArrayBuffer(arrayBuffer: ArrayBuffer): ArrayBuffer {
	const copy = new ArrayBuffer(arrayBuffer.byteLength);
	new Uint8Array(copy).set(new Uint8Array(arrayBuffer));
	return copy;
}

export function wrapAsyncRoute(
	handler: (res: HttpResponse, req: HttpRequest) => void,
) {
	return (res: HttpResponse, req: HttpRequest) => {
		let aborted = false;
		res.onAborted(() => {
			aborted = true;
		});

		// Call your async handler
		Promise.resolve(handler(res, req)).catch((err) => {
			if (!aborted) {
				console.error(err);
				res.writeStatus("500 Internal Server Error").end("Internal error");
			}
		});
	};
}

export function ratelimit(state: AppState, ip: string, ws: WS) {
	const { ratelimit } = state;
	if (ratelimit.has(ip)) {
		const { count, resetAt } = ratelimit.get(ip)!;
		if (Date.now() > resetAt) {
			ratelimit.set(ip, { count: 1, resetAt: Date.now() + 60 * 1000 });
		} else if (count >= 10) {
			sendWs(ws, {
				type: "error",
				message: "Too many requests",
			});
		} else {
			ratelimit.set(ip, { count: count + 1, resetAt });
		}
	} else {
		ratelimit.set(ip, { count: 1, resetAt: Date.now() + 5 * 60 * 1000 });
	}
}
