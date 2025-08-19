import { Redis } from "@upstash/redis";
import { decodeJwt, jwtVerify } from "jose";
import { HttpResponse } from "uWebSockets.js";
import { initialUsage, serversByRegion } from "./constants.ts";
import type { AppState, Server, User, WS } from "./types";

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

export async function fetchFromCache<T extends "usersCache" | "serversCache">(
  state: AppState,
  key: T,
  dataKey: string
): Promise<T extends "usersCache" ? User : Server> {
  const cache = state[key];
  if (cache[dataKey]) {
    return cache[dataKey] as T extends "usersCache" ? User : Server;
  }

  const fetchedValue = (await redis.json.get(dataKey)) as T extends "usersCache"
    ? User
    : Server;
  if (!fetchedValue) throw new Error("Invalid credentials");

  cache[dataKey] = fetchedValue;
  return fetchedValue;
}

export function updateServerUsage(
  state: AppState,
  id: string,
  usageType: keyof typeof initialUsage,
  increment = 1
) {
  const { usage } = state;
  if (!usage[id]) usage[id] = { ...initialUsage };

  const serverUsage = usage[id];

  const newValue = serverUsage[usageType] + increment;
  serverUsage[usageType] = newValue;

  if (usageType === "connections" && newValue > serverUsage.peakConnections) {
    serverUsage.peakConnections = newValue;
  }
  if (usageType === "dataTransfer" && increment > serverUsage.maxMessageSize) {
    serverUsage.maxMessageSize = increment;
  }
}

export async function fetchUser(state: AppState, userEmail: string) {
  return await fetchFromCache(state, "usersCache", `user-${userEmail}`);
}

export async function fetchServer(state: AppState, serverID: string) {
  return await fetchFromCache(state, "serversCache", `server-${serverID}`);
}

export async function decodeJWT<T extends string | undefined>(
  token: string,
  secret?: T
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

export async function getUserConnections(user: User, appState: AppState) {
  return (
    await Promise.all(
      user.servers.map(async (server) => {
        if (server.region === process.env.REGION) {
          return {
            usage: { connections: appState.usage[server.id]?.connections || 0 },
          };
        }

        const res = await fetch(
          `${serversByRegion[server.region]}/get-server/${server.id}`,
          {
            headers: {
              authorization: server.password,
            },
          }
        );

        return res.json();
      })
    )
  ).reduce(
    (total: number, data: any) => total + (data.usage?.connections || 0),
    0
  );
}

export function sendJsonResponse(
  res: HttpResponse,
  data: unknown,
  status = 200
) {
  res.writeStatus(`${status}`);
  res.writeHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export function sendWs(ws: WS, data: Record<string, unknown>) {
  ws.send(JSON.stringify(data));
}

export function parseJsonBody(
  res: HttpResponse
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
