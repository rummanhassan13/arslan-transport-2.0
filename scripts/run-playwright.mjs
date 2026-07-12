import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const appUrl = "http://127.0.0.1:4173/app/";

async function isReady() {
  try {
    const response = await fetch(appUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Vite test server did not become ready within 30 seconds.");
}

const alreadyRunning = await isReady();
const server = alreadyRunning ? null : spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", "4173"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_DEMO_MODE: "true" },
  stdio: "ignore",
  windowsHide: true,
});

try {
  await waitForServer();
  const runner = spawn(process.execPath, [playwrightCli, "test"], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: "1" },
    stdio: "inherit",
    windowsHide: true,
  });
  const exitCode = await new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  if (server?.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    } else {
      server.kill("SIGTERM");
    }
  }
}

