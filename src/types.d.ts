import type { TemplatedApp, WebSocket } from "uWebSockets.js";

export type Region = "usw" | "us3" | "eus";

export interface Usage {
  connections: number;
  messages: number;
  peakConnections: number;
  connectionsToday: number;
  dataTransfer: number;
  maxMessageSize: number;
}

export interface User {
  email: string;
  plan: "Hobby" | "Startup" | "Premium";
  servers: Server[];
}

export interface Server {
  id: string;
  password: string;
  owner: string;
  region: Region;
}

export interface AppState {
  app: TemplatedApp;
  serversCache: Record<string, Server>;
  usersCache: Record<string, User>;
  usage: Record<string, Usage>;
}

export type WS = WebSocket<{
  authenticated: boolean;
  server: Server;
  serverId: string;
  roomKey: string;
}>;

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      PORT?: string;
      REDIS_URL: string;
      REDIS_TOKEN: string;
      REGION: Region;
    }
  }
}
