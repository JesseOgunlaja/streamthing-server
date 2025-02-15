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
const constants_1 = require("./constants");
const utils_1 = require("./utils");
function setupSocketHandlers(appState) {
    const { hono, usage, io } = appState;
    io.on("connection", (socket) => {
        socket.on("authenticate", (token) => __awaiter(this, void 0, void 0, function* () {
            try {
                if (!token)
                    throw new Error("Invalid credentials");
                const decodedToken = yield (0, utils_1.decodeJWT)(token);
                if (typeof (decodedToken === null || decodedToken === void 0 ? void 0 : decodedToken.id) !== "string")
                    throw Error();
                const server = yield (0, utils_1.fetchServer)(appState, decodedToken.id);
                if (!server)
                    throw Error();
                const JWT_KEY = `${socket.id}-${server.password}`;
                const { id, channel } = (yield (0, utils_1.decodeJWT)(token, JWT_KEY));
                if (id !== decodedToken.id)
                    throw Error();
                const roomKey = (0, utils_1.hashString)(`${id}-${channel}`);
                socket.data.authenticated = true;
                socket.join(roomKey);
            }
            catch (_a) {
                return socket.emit("auth_error", "Invalid credentials");
            }
        }));
        socket.on("disconnect", () => {
            if (!socket.data.authenticated)
                return;
            (0, utils_1.updateServerUsage)(appState, socket.data.id, "connections", -1);
        });
    });
    hono.post("/emit-event", (c) => __awaiter(this, void 0, void 0, function* () {
        const { id, event, msg, channel, password } = yield c.req.json();
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
        io.to(roomKey).emit((0, utils_1.hashString)(event), msg);
        return c.json({ message: "Event emitted successfully" });
    }));
}
