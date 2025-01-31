require("dotenv").config();
import { Redis } from "@upstash/redis";
import CryptoJS from "crypto-js";
import { AppState, Server, Usage, UserType } from "./types";

export const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

export function encryptValue(data: unknown, secretKey: string) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), secretKey).toString();
}

export function decryptValue(value: string, secretKey: string) {
  const decrypted = CryptoJS.AES.decrypt(value, secretKey).toString(
    CryptoJS.enc.Utf8
  );
  return JSON.parse(decrypted);
}

export function getRoundedTimestamp() {
  const now = Date.now();
  const interval = 1000;
  return (Math.floor(now / interval) * interval).toString();
}

export function hashString(text: string) {
  return CryptoJS.SHA256(text).toString();
}

export function resetServerCache(state: AppState, id: string) {
  const { serversCache } = state;
  delete serversCache[`server-${id}`];
}

export function resetUserCache(state: AppState, id: string) {
  const { usersCache } = state;
  delete usersCache[`user-${id}`];
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

export function readID(encryptedID: string) {
  try {
    const id = decryptValue(encryptedID, getRoundedTimestamp());
    return id;
  } catch {
    throw new Error("Invalid ID");
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
