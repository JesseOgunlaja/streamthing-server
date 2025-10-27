import type { TemplatedApp, WebSocket } from "uWebSockets.js";

export type Region = "usw" | "us3" | "eus";

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
	plan: "Hobby" | "Startup" | "Premium";
	servers: Server[];
}

export interface Server {
	id: string;
	password: string;
	owner: string;
	region: Region;
}

export interface AppState {
	app: TemplatedApp;
	serversCache: Record<string, Server>;
	usersCache: Record<string, User>;
	disabled: Set<string>;
	ratelimit: Map<string, { count: number; resetAt: number }>;
}

export type WS = WebSocket<{
	ip: string;
	authenticated: boolean;
	serverAuthenticated: boolean;
	server: Server;
	serverId: string;
	roomKey: string;
}>;

export type ENV = {
	NODE_ENV: "development" | "production" | "test";
	PORT?: string;
	UPSTASH_REDIS_URL: string;
	UPSTASH_REDIS_TOKEN: string;
	REGION: Region;
	REDIS_PASSWORD: string;
	ADMIN_PASSWORD: string;
};
