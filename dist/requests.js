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
exports.setupRequestHandlers = setupRequestHandlers;
const utils_1 = require("./utils");
function setupRequestHandlers(appState) {
    const { hono, usage } = appState;
    hono.get("/get-server/:id", (c) => __awaiter(this, void 0, void 0, function* () {
        const id = c.req.param("id");
        if (id === "932")
            return c.json({ message: "Cron job success" }, 200);
        const password = c.req.header("Authorization");
        if (!id || !password)
            return c.json({ message: "Invalid params" }, 422);
        const server = yield (0, utils_1.fetchServer)(appState, id);
        if (password !== server.password)
            return c.json({}, 401);
        return c.json({ usage: usage[id] || (0, utils_1.getInitialUsage)() });
    }));
    hono.post("/reset-server-cache/:id", (c) => __awaiter(this, void 0, void 0, function* () {
        const id = c.req.param("id");
        if (!id)
            return c.json({ message: "Invalid params" }, 422);
        const server = yield (0, utils_1.fetchServer)(appState, id);
        if (server.password !== c.req.header("Authorization"))
            return c.json({ message: "Unauthorized" }, 401);
        resetServerCache(appState, id);
        return c.json({ message: "Server cache reset" });
    }));
    hono.post("/reset-user-cache/:id", (c) => __awaiter(this, void 0, void 0, function* () {
        const id = c.req.param("id");
        if (!id)
            return c.json({ message: "Invalid params" }, 422);
        resetUserCache(appState, id);
        return c.json({ message: "User cache reset" });
    }));
}
function resetServerCache(state, id) {
    const { serversCache } = state;
    delete serversCache[`server-${id}`];
}
function resetUserCache(state, id) {
    const { usersCache } = state;
    delete usersCache[`user-${id}`];
}
