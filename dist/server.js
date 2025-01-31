"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const hono_1 = require("hono");
const socket_io_1 = require("socket.io");
const requests_1 = require("./requests");
const setup_1 = require("./setup");
const sockets_1 = require("./sockets");
const app = new hono_1.Hono();
// @ts-ignore
const appState = {
    serversCache: {},
    usersCache: {},
    usage: {},
    hono: app,
};
(0, setup_1.setupServer)(appState);
(0, requests_1.setupRequestHandlers)(appState);
const server = (0, node_server_1.serve)({
    hostname: "0.0.0.0",
    fetch: app.fetch,
    port: 5000,
});
const io = new socket_io_1.Server(server, {
    transports: ["websocket"],
});
appState.io = io;
(0, sockets_1.setupSocketHandlers)(appState);
console.log(`Listening on port ${process.env.PORT}`);
