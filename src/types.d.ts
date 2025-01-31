import { Hono } from "hono";
import { Server as SocketServer } from "socket.io";

export interface AppState {
  serversCache: ServerRecords;
  usage: UsageRecords;
  usersCache: UserRecords;
  hono: Hono;
  io: SocketServer;
}

export type GenericObject = Record<string, any>;

export type Usage = {
  connections: number;
  messages: number;
  peakConnections: number;
  connectionsToday: number;
  maxMessageSize: number;
  dataTransfer: number;
};
export type UsageRecords = Record<string, Usage>;

export type UserType = {
  plan: "Hobby" | "Startup" | "Premium" | "Enterprise";
};
export type UserRecords = Record<string, UserType>;

export type DatabaseUsage = Record<
  string,
  { usageEntries: (Usage & { region: string })[] }
>;

export type Server = {
  name: string;
  region: string;
  id: string;
  password: string;
  owner: string;
};

export type ServerRecords = Record<string, Server>;

export type CacheEntry = UserType | Server;

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SERVER_DB_URL: string;
      SERVER_DB_PASSWORD: string;
      REDIS_URL: string;
      REDIS_TOKEN: string;
      REGION: string;
      REDIS_USAGE_URL: string;
      REDIS_USAGE_TOKEN: string;
      DATABASE_URL: string;
      NODE_ENV: "development" | "production" | "test";
    }
  }
}

export {};
