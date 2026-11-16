// tests/simPool.test.js: a sim worker that exits mid-fight without an error.
import { parentPort } from "worker_threads";
parentPort.on("message", () => process.exit(3));
