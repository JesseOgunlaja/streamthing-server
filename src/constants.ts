import type { Usage } from "./types";

export const planLimits = {
  Hobby: {
    connections: 1000,
    messages: 100000,
    maxMessageSize: 15,
  },
  Startup: {
    connections: 10000,
    messages: 1000000,
    maxMessageSize: 15,
  },
  Premium: {
    connections: 50000,
    messages: 5000000,
    maxMessageSize: 15,
  },
} as const;

export const MB = 1048576;

export const serversByRegion = {
  usw: "https://usw.streamthing.dev",
  us3: "https://us3.streamthing.dev",
  eus: "https://eus.streamthing.dev",
} as const;

export const initialUsage = {
  connections: 0,
  messages: 0,
  peakConnections: 0,
  connectionsToday: 0,
  dataTransfer: 0,
  maxMessageSize: 0,
} satisfies Usage;
