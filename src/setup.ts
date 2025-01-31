import { cors } from "hono/cors";
import * as cron from "node-cron";
import { AppState } from "./types";

export function setupServer(state: AppState) {
  const { hono, usage, usersCache, serversCache } = state;

  hono.use(
    cors({
      origin: "*",
    })
  );

  cron.schedule("*/30 * * * *", () => {
    Object.keys(usersCache).forEach((key) => delete usersCache[key]);
    Object.keys(serversCache).forEach((key) => delete serversCache[key]);
  });

  cron.schedule("0 0 * * *", () => {
    Object.keys(usage).forEach((key) => delete usage[key]);
  });
}
