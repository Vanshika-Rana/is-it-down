const { initDb, closeDb } = require("./db");
const { closeCache } = require("./cache");
const { startServer, stopServer } = require("./server");
const { startWorker, stopWorker } = require("./worker");

async function bootstrap() {
	await initDb();
	startServer();
	startWorker();
}

async function shutdown(signal) {
	console.log(`Received ${signal}, shutting down...`);
	stopWorker();
	stopServer();
	await closeCache();
	await closeDb();
	process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

bootstrap().catch((error) => {
	console.error("Failed to start application:", error);
	process.exit(1);
});
