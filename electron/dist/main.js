"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_net_1 = require("node:net");
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const HOST = "127.0.0.1";
const FIRST_PORT = 3777;
const STARTUP_TIMEOUT_MS = 45_000;
let mainWindow = null;
let nextServer = null;
let localOrigin = "";
let stoppingServer = null;
let quitAfterCleanup = false;
electron_1.app.setName("Curio");
function projectRoot() {
    return electron_1.app.isPackaged
        ? electron_1.app.getAppPath()
        : node_path_1.default.resolve(__dirname, "../..");
}
async function findFreePort(startPort) {
    for (let port = startPort; port <= 65_535; port += 1) {
        const available = await new Promise((resolve, reject) => {
            const probe = (0, node_net_1.createServer)();
            probe.unref();
            probe.once("error", (error) => {
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
        if (available)
            return port;
    }
    throw new Error(`No free local port found from ${startPort}.`);
}
function startNextServer(root, port) {
    const nextBin = node_path_1.default.join(root, "node_modules", "next", "dist", "bin", "next");
    const child = (0, node_child_process_1.spawn)(process.execPath, [nextBin, "start", "--hostname", HOST, "--port", String(port)], {
        cwd: root,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            NODE_ENV: "production",
        },
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
    child.stderr?.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
    child.once("exit", () => {
        if (nextServer === child)
            nextServer = null;
    });
    return child;
}
async function waitForHttp200(child, url) {
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
            if (response.status === 200)
                return;
        }
        catch {
            // The server is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Timed out waiting for the local Next server.");
}
function isLocalUrl(rawUrl) {
    try {
        return new URL(rawUrl).origin === localOrigin;
    }
    catch {
        return false;
    }
}
function configurePermissions() {
    const isLocalRequest = (rawUrl) => {
        try {
            return new URL(rawUrl).origin === localOrigin;
        }
        catch {
            return false;
        }
    };
    electron_1.session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => permission === "media" && isLocalRequest(requestingOrigin));
    electron_1.session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(permission === "media" && isLocalRequest(webContents.getURL()));
    });
}
async function requestMicrophoneAccess() {
    if (process.platform !== "darwin")
        return;
    try {
        await electron_1.systemPreferences.askForMediaAccess("microphone");
    }
    catch (error) {
        console.warn("Unable to request microphone access:", error);
    }
}
function openExternal(rawUrl) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol === "http:" || url.protocol === "https:") {
            void electron_1.shell.openExternal(url.toString());
        }
    }
    catch {
        // Ignore malformed links.
    }
}
function createWindow(url) {
    const window = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1180,
        minHeight: 760,
        title: "Curio",
        titleBarStyle: "hiddenInset",
        backgroundColor: "#0d1714",
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        if (!isLocalUrl(targetUrl))
            openExternal(targetUrl);
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
async function stopNextServer() {
    if (stoppingServer)
        return stoppingServer;
    const child = nextServer;
    if (!child || child.pid === undefined || child.exitCode !== null) {
        nextServer = null;
        return;
    }
    stoppingServer = new Promise((resolve) => {
        let finished = false;
        const finish = () => {
            if (finished)
                return;
            finished = true;
            nextServer = null;
            resolve();
        };
        child.once("exit", finish);
        try {
            if (process.platform === "win32")
                child.kill("SIGTERM");
            else
                process.kill(-child.pid, "SIGTERM");
        }
        catch {
            finish();
            return;
        }
        setTimeout(() => {
            if (finished)
                return;
            try {
                if (process.platform === "win32")
                    child.kill("SIGKILL");
                else
                    process.kill(-child.pid, "SIGKILL");
            }
            catch {
                // It exited between the timeout and the signal.
            }
            setTimeout(finish, 500);
        }, 2_000).unref();
    }).finally(() => {
        stoppingServer = null;
    });
    return stoppingServer;
}
function stopNextServerSynchronously() {
    const child = nextServer;
    if (!child?.pid || child.exitCode !== null)
        return;
    try {
        if (process.platform === "win32")
            child.kill("SIGKILL");
        else
            process.kill(-child.pid, "SIGKILL");
    }
    catch {
        // The process has already exited.
    }
}
async function launch() {
    const root = projectRoot();
    if (!(0, node_fs_1.existsSync)(node_path_1.default.join(root, ".next", "BUILD_ID"))) {
        await electron_1.dialog.showMessageBox({
            type: "warning",
            title: "Curio needs a production build",
            message: "Curio is not built yet.",
            detail: "Run npm run build first, then open Curio again.",
            buttons: ["Quit"],
            defaultId: 0,
        });
        electron_1.app.quit();
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
electron_1.app.whenReady().then(launch).catch(async (error) => {
    await stopNextServer();
    await electron_1.dialog.showMessageBox({
        type: "error",
        title: "Curio could not start",
        message: "Curio could not start its local server.",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["Quit"],
    });
    electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (!mainWindow && localOrigin)
        mainWindow = createWindow(`${localOrigin}/`);
});
electron_1.app.on("window-all-closed", () => {
    electron_1.app.quit();
});
electron_1.app.on("before-quit", (event) => {
    if (quitAfterCleanup || !nextServer)
        return;
    event.preventDefault();
    void stopNextServer().finally(() => {
        quitAfterCleanup = true;
        electron_1.app.quit();
    });
});
process.once("SIGINT", () => {
    void stopNextServer().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
    void stopNextServer().finally(() => process.exit(0));
});
process.once("exit", stopNextServerSynchronously);
