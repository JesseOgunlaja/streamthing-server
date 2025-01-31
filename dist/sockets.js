"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketHandlers = setupSocketHandlers;
const crypto_1 = require("crypto");
const constants_1 = require("./constants");
const utils_1 = require("./utils");
const activeSessions = new Map();
const pendingConnections = new Map();
function setupSocketHandlers(appState) {
    const { hono, usage, io } = appState;
    io.use((socket, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            const { id, channel } = socket.handshake.query;
            if (!id || !channel)
                return next(new Error("Invalid params"));
            const server = (yield (0, utils_1.fetchServer)(appState, id));
            const user = (yield (0, utils_1.fetchUser)(appState, server.owner));
            const userUsageData = usage[server.owner] || (0, utils_1.getInitialUsage)();
            const userPlanLimits = constants_1.planLimits[user.plan];
            if (!user || !server) {
                return next(new Error("Invalid credentials"));
            }
            if (userUsageData.connections >= userPlanLimits.connections) {
                return next(new Error("Connection limit exceeded"));
            }
            socket.data.id = id;
            socket.data.channel = channel;
            socket.data.authenticated = false;
            next();
        }
        catch (error) {
            console.log(error);
            next(new Error(`${error}`));
        }
    }));
    io.on("connection", (socket) => {
        const sid = socket.id;
        socket.on("challenge", (id) => __awaiter(this, void 0, void 0, function* () {
            const server = yield (0, utils_1.fetchServer)(appState, id);
            if (!server)
                return;
            const challenge = (0, crypto_1.randomBytes)(32).toString("hex");
            const expectedResponse = (0, crypto_1.createHmac)("sha256", server.password)
                .update(challenge)
                .digest("hex");
            pendingConnections.set(id, expectedResponse);
            socket.emit("challenge-response", challenge);
        }));
        socket.on("authenticate", (credentials) => __awaiter(this, void 0, void 0, function* () {
            const { id, channel, challenge } = credentials;
            if (pendingConnections.get(id) !== challenge) {
                return socket.emit("auth_error", "Invalid challenge response");
            }
            pendingConnections.delete(id);
            const sessionToken = (0, crypto_1.randomBytes)(32).toString("hex");
            activeSessions.set(sid, { id, sessionToken });
            const server = (yield (0, utils_1.fetchServer)(appState, id));
            (0, utils_1.updateServerUsage)(appState, server.id, "connections");
            (0, utils_1.updateServerUsage)(appState, server.id, "connectionsToday");
            socket.data.authenticated = true;
            const roomKey = (0, utils_1.hashString)(`${id}-${channel}`);
            socket.join(roomKey);
        }));
        socket.on("disconnect", () => __awaiter(this, void 0, void 0, function* () {
            if (socket.data.authenticated) {
                const session = activeSessions.get(sid);
                if (session) {
                    const server = (yield (0, utils_1.fetchServer)(appState, session.id));
                    (0, utils_1.updateServerUsage)(appState, server.id, "connections", -1);
                }
                activeSessions.delete(sid);
            }
        }));
        // Middleware for authenticated routes
        socket.use((packet, next) => {
            if (socket.data.authenticated ||
                packet[0] === "challenge" ||
                packet[0] === "authenticate") {
                next();
            }
            else {
                next(new Error("Not authenticated"));
            }
        });
    });
    // New endpoint for challenge-response
    hono.post("/challenge", (c) => __awaiter(this, void 0, void 0, function* () {
        const { id } = yield c.req.json();
        const server = yield (0, utils_1.fetchServer)(appState, id);
        if (!server) {
            return c.json({ error: "Invalid server ID" }, 401);
        }
        const challenge = (0, crypto_1.randomBytes)(32).toString("hex");
        const expectedResponse = (0, crypto_1.createHmac)("sha256", server.password)
            .update(challenge)
            .digest("hex");
        pendingConnections.set(id, expectedResponse);
        return c.json({ challenge });
    }));
    hono.post("/emit-event", (c) => __awaiter(this, void 0, void 0, function* () {
        const { id, event, msg, channel, password, encryptionKey } = yield c.req.json();
        if (!id || !event || !channel || !msg || !password) {
            return c.json({ message: "Invalid params" }, 422);
        }
        const server = yield (0, utils_1.fetchServer)(appState, id);
        const user = yield (0, utils_1.fetchUser)(appState, server.owner);
        const userUsageData = usage[server.owner] || (0, utils_1.getInitialUsage)();
        const userPlanLimits = constants_1.planLimits[user.plan];
        if (server.password !== password) {
            return c.json({ message: "Invalid credentials" }, 401);
        }
        if (userUsageData.messages >= userPlanLimits.messages) {
            return c.json({ message: "Message limit exceeded" }, 401);
        }
        const messageSize = JSON.stringify(msg).length;
        (0, utils_1.updateServerUsage)(appState, server.id, "dataTransfer", messageSize);
        (0, utils_1.updateServerUsage)(appState, server.id, "messages");
        const roomKey = (0, utils_1.hashString)(`${id}-${channel}`);
        const newMsg = encryptionKey ? (0, utils_1.encryptValue)(msg, encryptionKey) : msg;
        io.to(roomKey).emit((0, utils_1.hashString)(event), newMsg);
        return c.json({ message: "Event emitted successfully" });
    }));
}
