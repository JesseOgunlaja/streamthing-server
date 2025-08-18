import { Redis } from "@upstash/redis";
import { decodeJwt, jwtVerify } from "jose";
import { initialUsage, serversByRegion } from "./constants.js";

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

export async function fetchFromCache(state, key, dataKey) {
  const cache = state[key];
  if (cache[dataKey]) return cache[dataKey];

  const fetchedValue = await redis.json.get(dataKey);
  if (!fetchedValue) throw new Error("Invalid credentials");

  cache[dataKey] = fetchedValue;
  return cache[dataKey];
}

export function updateServerUsage(state, id, usageType, increment = 1) {
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

export async function fetchUser(state, userEmail) {
  return await fetchFromCache(state, "usersCache", `user-${userEmail}`);
}

export async function fetchServer(state, serverID) {
  return await fetchFromCache(state, "serversCache", `server-${serverID}`);
}

export async function decodeJWT(token, secret) {
  try {
    if (secret) {
      const secretBuffer = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretBuffer);
      return payload;
    } else {
      return decodeJwt(token);
    }
  } catch {}
}

export async function getUserConnections(user, appState) {
  const serverData = await Promise.all(
    user.servers.map(async (server) => {
      if (server.region === process.env.REGION) {
        return {
          usage: { connections: appState.usage[server.id]?.connections || 0 },
        };
      }

      const URL = `${serversByRegion[server.region]}/get-server/${server.id}`;
      const res = await fetch(URL, {
        headers: {
          authorization: server.password,
        },
      });

      return res.json();
    })
  );

  return serverData.reduce((total, data) => total + data.usage.connections, 0);
}

export function sendJsonResponse(res, data, status = 200) {
  res.writeStatus(`${status}`);
  res.writeHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export function sendWs(ws, data) {
  ws.send(JSON.stringify(data));
}

export function parseJsonBody(res) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let totalSize = 0;
    const maxBodySize = 4 * 1024 * 1024;

    res.onData((chunk, isLast) => {
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
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      }
    });

    res.onAborted(() => {
      reject(new Error("Request aborted"));
    });
  });
}

function copyArrayBuffer(arrayBuffer) {
  const copy = new ArrayBuffer(arrayBuffer.byteLength);
  new Uint8Array(copy).set(new Uint8Array(arrayBuffer));
  return copy;
}
