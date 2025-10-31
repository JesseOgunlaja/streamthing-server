import {
	createClientStream,
	createServerStream,
	createToken,
} from "streamthing";

const { SERVER_ID, SERVER_PASSWORD, SERVER_REGION } = process.env;
const CHANNEL = "test-channel";

async function runTest() {
	const token = await createToken({
		channel: CHANNEL,
		password: SERVER_PASSWORD,
	});
	const client = createClientStream({
		region: SERVER_REGION,
		id: SERVER_ID,
		token,
	});

	const server = createServerStream({
		id: SERVER_ID,
		region: SERVER_REGION,
		password: SERVER_PASSWORD,
	});
	server.send(CHANNEL, "message", "test-success");

	try {
		await new Promise((resolve, reject) => {
			client.receive("message", (message) =>
				message === "test-success"
					? resolve("Success")
					: reject(new Error("Message did not match")),
			);
			setTimeout(() => reject(new Error("Timeout waiting for message")), 10000);
		});
		client.disconnect();
		process.exit(0);
	} catch {
		process.exit(1);
	}
}

runTest();
