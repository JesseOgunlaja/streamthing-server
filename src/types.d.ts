import type { TemplatedApp, WebSocket } from "uWebSockets.js";

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
  plan: "Hobby" | "Startup" | "Premium" | "Enterprise";
  servers: Server[];
}

export interface Server {
  id: string;
  password: string;
  owner: string;
  region: "usw" | "us3";
}

export interface AppState {
  app: TemplatedApp;
  serversCache: Record<string, Server>;
  usersCache: Record<string, User>;
  usage: Record<string, Usage>;
  activeConnections: Map<string, WS>;
}

export type WS = WebSocket<{
  authenticated: boolean;
  server: Server;
  roomKey: string;
  connectionId: string;
}>;

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production" | "test";
      PORT?: string;
      REDIS_URL: string;
      REDIS_TOKEN: string;
      REGION: "usw" | "us3";
    }
  }
}
