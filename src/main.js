const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { SerialPort } = require("serialport");

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {import('serialport').SerialPort | null} */
let port = null;
let portInfo = null; // { path: string, connectionId: number }
let connectionSeq = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

async function listPorts() {
  const ports = await SerialPort.list();
  // Normaliza campos entre OS/drivers.
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer ?? "",
    serialNumber: p.serialNumber ?? "",
    productId: p.productId ?? "",
    vendorId: p.vendorId ?? "",
    friendlyName: p.friendlyName ?? "",
    pnpId: p.pnpId ?? "",
  }));
}

async function disconnect() {
  if (!port) return { ok: true };
  const current = port;
  const currentInfo = portInfo;
  port = null;
  portInfo = null;

  await new Promise((resolve) => {
    try {
      if (!current.isOpen) return resolve();
      current.close(() => resolve());
    } catch {
      resolve();
    }
  });

  return { ok: true, ...currentInfo };
}

async function connect({ path: nextPath } = {}) {
  if (!nextPath) throw new Error("Selecione uma porta antes de conectar.");

  await disconnect();

  const connectionId = ++connectionSeq;
  const thisPath = nextPath;
  portInfo = { path: thisPath, connectionId };
  port = new SerialPort({
    path: nextPath,
    // Em Bluetooth SPP o “baud” do link não é configurado aqui; o RS232 é controlado no BS1C.
    // A SerialPort ainda exige um valor, então mantemos um default seguro.
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    autoOpen: false,
  });

  port.on("data", (buf) => {
    sendToRenderer("serial:data", {
      path: thisPath,
      connectionId,
      data: buf.toString("utf8"),
      bytes: buf.length,
      ts: Date.now(),
    });
  });

  port.on("error", (err) => {
    sendToRenderer("serial:error", {
      path: thisPath,
      connectionId,
      message: err?.message ?? String(err),
      ts: Date.now(),
    });
  });

  port.on("close", () => {
    sendToRenderer("serial:closed", {
      path: thisPath,
      connectionId,
      ts: Date.now(),
    });
  });

  await new Promise((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()));
  });

  // Se a porta “abre e fecha” imediatamente, não faz sentido reportar "OK conectado".
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (
    !port ||
    !port.isOpen ||
    !portInfo ||
    portInfo.connectionId !== connectionId
  ) {
    throw new Error(
      `A porta abriu e fechou imediatamente (${thisPath}). No macOS, prefira /dev/cu.* em vez de /dev/tty.*.`
    );
  }

  return { ok: true, path: thisPath, connectionId };
}

function requireOpenPort() {
  if (!port || !port.isOpen)
    throw new Error("Não conectado. Conecte a uma porta primeiro.");
  return port;
}

async function writeAndCapture({
  message = "",
  durationMs = 1000,
  appendCRLF = true,
} = {}) {
  const p = requireOpenPort();

  const normalizedDuration = Math.max(0, Number(durationMs) || 1000);
  const dataChunks = [];
  const onData = (buf) => dataChunks.push(buf);

  p.on("data", onData);

  const payload = appendCRLF ? `${message}\r\n` : `${message}`;

  await new Promise((resolve, reject) => {
    p.write(payload, (err) => {
      if (err) return reject(err);
      p.drain((drainErr) => (drainErr ? reject(drainErr) : resolve()));
    });
  });

  await new Promise((resolve) => setTimeout(resolve, normalizedDuration));

  p.off("data", onData);

  const combined = Buffer.concat(dataChunks);
  return {
    ok: true,
    sent: payload,
    received: combined.toString("utf8"),
    receivedBytes: combined.length,
    durationMs: normalizedDuration,
  };
}

ipcMain.handle("serial:listPorts", async () => listPorts());
ipcMain.handle("serial:connect", async (_evt, args) => connect(args));
ipcMain.handle("serial:disconnect", async () => disconnect());
ipcMain.handle("serial:writeAndCapture", async (_evt, args) =>
  writeAndCapture(args)
);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await disconnect();
  if (process.platform !== "darwin") app.quit();
});
