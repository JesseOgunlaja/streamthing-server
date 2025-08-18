import * as cron from "node-cron";

export function setupServer(state) {
  const { app, usage, usersCache, serversCache } = state;

  app.options("/*", (res) => {
    res
      .writeHeader("Access-Control-Allow-Origin", "*")
      .writeHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS, PUT, DELETE"
      )
      .writeHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      )
      .writeHeader("Access-Control-Max-Age", "86400")
      .end();
  });

  app.any("/*", (res) => {
    res.writeHeader("Access-Control-Allow-Origin", "*");
    return false;
  });

  cron.schedule("*/30 * * * *", () => {
    Object.keys(usersCache).forEach((key) => delete usersCache[key]);
    Object.keys(serversCache).forEach((key) => delete serversCache[key]);
  });

  cron.schedule("0 0 * * *", () => {
    Object.keys(usage).forEach((key) => delete usage[key]);
  });
}
