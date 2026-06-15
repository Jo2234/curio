import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  session,
  shell,
  systemPreferences,
} from "electron";

const HOST = "127.0.0.1";
const FIRST_PORT = 3777;
const STARTUP_TIMEOUT_MS = 45_000;

let mainWindow: BrowserWindow | null = null;
let nextServer: ChildProcess | null = null;
let localOrigin = "";
let stoppingServer: Promise<void> | null = null;
let quitAfterCleanup = false;

app.setName("Curio");

function projectRoot(): string {
  return app.isPackaged
    ? app.getAppPath()
    : path.resolve(__dirname, "../..");
}

async function findFreePort(startPort: number): Promise<number> {
  for (let port = startPort; port <= 65_535; port += 1) {
    const available = await new Promise<boolean>((resolve, reject) => {
      const probe = createServer();
      probe.unref();
      probe.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          resolve(false);
          return;
        }
        reject(error);
      });
      probe.listen(port, HOST, () => {
        probe.close((error) => (error ? reject(error) : resolve(true)));
      });
    });

    if (available) return port;
  }

  throw new Error(`No free local port found from ${startPort}.`);
}

function startNextServer(root: string, port: number): ChildProcess {
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", HOST, "--port", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  child.once("exit", () => {
    if (nextServer === child) nextServer = null;
  });

  return child;
}

async function waitForHttp200(child: ChildProcess, url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local Next server exited before Curio was ready.");
    }

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for the local Next server.");
}

function isLocalUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === localOrigin;
  } catch {
    return false;
  }
}

function configurePermissions(): void {
  const isLocalRequest = (rawUrl: string) => {
    try {
      return new URL(rawUrl).origin === localOrigin;
    } catch {
      return false;
    }
  };

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      permission === "media" && isLocalRequest(requestingOrigin),
  );
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(
        permission === "media" && isLocalRequest(webContents.getURL()),
      );
    },
  );
}

async function requestMicrophoneAccess(): Promise<void> {
  if (process.platform !== "darwin") return;

  try {
    await systemPreferences.askForMediaAccess("microphone");
  } catch (error) {
    console.warn("Unable to request microphone access:", error);
  }
}

function openExternal(rawUrl: string): void {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed links.
  }
}

function createWindow(url: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: "Curio",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0d1714",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (!isLocalUrl(targetUrl)) openExternal(targetUrl);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isLocalUrl(targetUrl)) {
      event.preventDefault();
      openExternal(targetUrl);
    }
  });
  window.once("closed", () => {
    mainWindow = null;
  });
  void window.loadURL(url);
  return window;
}

async function stopNextServer(): Promise<void> {
  if (stoppingServer) return stoppingServer;

  const child = nextServer;
  if (!child || child.pid === undefined || child.exitCode !== null) {
    nextServer = null;
    return;
  }

  stoppingServer = new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      nextServer = null;
      resolve();
    };

    child.once("exit", finish);

    try {
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid!, "SIGTERM");
    } catch {
      finish();
      return;
    }

    setTimeout(() => {
      if (finished) return;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid!, "SIGKILL");
      } catch {
        // It exited between the timeout and the signal.
      }
      setTimeout(finish, 500);
    }, 2_000).unref();
  }).finally(() => {
    stoppingServer = null;
  });

  return stoppingServer;
}

function stopNextServerSynchronously(): void {
  const child = nextServer;
  if (!child?.pid || child.exitCode !== null) return;

  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // The process has already exited.
  }
}

async function launch(): Promise<void> {
  const root = projectRoot();
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
    await dialog.showMessageBox({
      type: "warning",
      title: "Curio needs a production build",
      message: "Curio is not built yet.",
      detail: "Run npm run build first, then open Curio again.",
      buttons: ["Quit"],
      defaultId: 0,
    });
    app.quit();
    return;
  }

  const port = await findFreePort(FIRST_PORT);
  localOrigin = `http://${HOST}:${port}`;
  configurePermissions();

  nextServer = startNextServer(root, port);
  await waitForHttp200(nextServer, `${localOrigin}/`);
  mainWindow = createWindow(`${localOrigin}/`);
  await requestMicrophoneAccess();
}

app.whenReady().then(launch).catch(async (error: unknown) => {
  await stopNextServer();
  await dialog.showMessageBox({
    type: "error",
    title: "Curio could not start",
    message: "Curio could not start its local server.",
    detail: error instanceof Error ? error.message : String(error),
    buttons: ["Quit"],
  });
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow && localOrigin) mainWindow = createWindow(`${localOrigin}/`);
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (quitAfterCleanup || !nextServer) return;
  event.preventDefault();
  void stopNextServer().finally(() => {
    quitAfterCleanup = true;
    app.quit();
  });
});

process.once("SIGINT", () => {
  void stopNextServer().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void stopNextServer().finally(() => process.exit(0));
});
process.once("exit", stopNextServerSynchronously);
