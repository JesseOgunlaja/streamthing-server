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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
exports.encryptValue = encryptValue;
exports.decryptValue = decryptValue;
exports.getRoundedTimestamp = getRoundedTimestamp;
exports.hashString = hashString;
exports.resetServerCache = resetServerCache;
exports.resetUserCache = resetUserCache;
exports.fetchFromCache = fetchFromCache;
exports.updateServerUsage = updateServerUsage;
exports.readID = readID;
exports.getInitialUsage = getInitialUsage;
exports.fetchUser = fetchUser;
exports.fetchServer = fetchServer;
require("dotenv").config();
const redis_1 = require("@upstash/redis");
const crypto_js_1 = __importDefault(require("crypto-js"));
exports.redis = new redis_1.Redis({
    url: process.env.REDIS_URL,
    token: process.env.REDIS_TOKEN,
});
function encryptValue(data, secretKey) {
    return crypto_js_1.default.AES.encrypt(JSON.stringify(data), secretKey).toString();
}
function decryptValue(value, secretKey) {
    const decrypted = crypto_js_1.default.AES.decrypt(value, secretKey).toString(crypto_js_1.default.enc.Utf8);
    return JSON.parse(decrypted);
}
function getRoundedTimestamp() {
    const now = Date.now();
    const interval = 1000;
    return (Math.floor(now / interval) * interval).toString();
}
function hashString(text) {
    return crypto_js_1.default.SHA256(text).toString();
}
function resetServerCache(state, id) {
    const { serversCache } = state;
    delete serversCache[`server-${id}`];
}
function resetUserCache(state, id) {
    const { usersCache } = state;
    delete usersCache[`user-${id}`];
}
function fetchFromCache(state, key, dataKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const cache = state[key];
        if (cache[dataKey])
            return cache[dataKey];
        const fetchedValue = (yield exports.redis.json.get(dataKey));
        if (!fetchedValue)
            throw new Error("Invalid credentials");
        cache[dataKey] = fetchedValue;
        return cache[dataKey];
    });
}
function updateServerUsage(state, id, usageType, increment = 1) {
    const { usage } = state;
    if (!usage[id])
        usage[id] = getInitialUsage();
    const serverUsage = usage[id];
    const newValue = serverUsage[usageType] + increment;
    serverUsage[usageType] = newValue;
    if (usageType === "connections" && newValue > serverUsage.peakConnections) {
        serverUsage.peakConnections = newValue;
    }
    if (usageType === "dataTransfer" && increment > serverUsage.maxMessageSize) {
        serverUsage.maxMessageSize = increment;
    }
}
function readID(encryptedID) {
    try {
        const id = decryptValue(encryptedID, getRoundedTimestamp());
        return id;
    }
    catch (_a) {
        throw new Error("Invalid ID");
    }
}
function getInitialUsage() {
    return {
        connections: 0,
        messages: 0,
        peakConnections: 0,
        connectionsToday: 0,
        dataTransfer: 0,
        maxMessageSize: 0,
    };
}
function fetchUser(state, userEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield fetchFromCache(state, "usersCache", `user-${userEmail}`);
    });
}
function fetchServer(state, serverID) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield fetchFromCache(state, "serversCache", `server-${serverID}`);
    });
}
