"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MB = exports.planLimits = void 0;
exports.planLimits = {
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
exports.MB = 1048576;
