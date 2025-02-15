require("dotenv").config();
import { Redis } from "@upstash/redis";
import CryptoJS from "crypto-js";
import { decodeJwt, jwtVerify } from "jose";
import { AppState, Server, Usage, UserType } from "./types";

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

export function hashString(text: string) {
  return CryptoJS.SHA256(text).toString();
}

export async function fetchFromCache<T extends UserType | Server>(
  state: AppState,
  key: T extends UserType ? "usersCache" : "serversCache",
  dataKey: string
): Promise<T> {
  const cache = state[key];
  if (cache[dataKey]) return cache[dataKey] as T;

  const fetchedValue = (await redis.json.get(dataKey)) as T | undefined;
  if (!fetchedValue) throw new Error("Invalid credentials");

  cache[dataKey] = fetchedValue;
  return cache[dataKey] as T;
}

export function updateServerUsage(
  state: AppState,
  id: string,
  usageType: keyof Usage,
  increment = 1
) {
  const { usage } = state;
  if (!usage[id]) usage[id] = getInitialUsage();

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

export function getInitialUsage() {
  return {
    connections: 0,
    messages: 0,
    peakConnections: 0,
    connectionsToday: 0,
    dataTransfer: 0,
    maxMessageSize: 0,
  };
}

export async function fetchUser(
  state: AppState,
  userEmail: string
): Promise<UserType> {
  return await fetchFromCache(state, "usersCache", `user-${userEmail}`);
}

export async function fetchServer(
  state: AppState,
  serverID: string
): Promise<Server> {
  return await fetchFromCache(state, "serversCache", `server-${serverID}`);
}

export async function decodeJWT(token: string, secret?: string) {
  try {
    if (secret) {
      const secretBuffer = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretBuffer);
      return payload;
    } else {
      return decodeJwt(token);
    }
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
}
