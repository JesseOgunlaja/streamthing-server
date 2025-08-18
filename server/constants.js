export const planLimits = {
  Hobby: {
    connections: 1000,
    messages: 100000,
    maxMessageSize: 15,
  },
  Startup: {
    connections: 2,
    messages: 500000,
    maxMessageSize: 15,
  },
  Premium: {
    connections: 25000,
    messages: 1000000,
    maxMessageSize: 15,
  },
  Enterprise: {
    connections: 100000,
    messages: 5000000,
    maxMessageSize: 15,
  },
};

export const MB = 1048576;

export const serversByRegion = {
  usw: "https://usw.streamthing.dev",
};

export const initialUsage = {
  connections: 0,
  messages: 0,
  peakConnections: 0,
  connectionsToday: 0,
  dataTransfer: 0,
  maxMessageSize: 0,
};
