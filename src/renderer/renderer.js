/* global bs1c */

const $ = (id) => document.getElementById(id);

const portSelect = $('portSelect');
const refreshPortsBtn = $('refreshPortsBtn');
const connectBtn = $('connectBtn');
const disconnectBtn = $('disconnectBtn');
const statusBadge = $('statusBadge');
const portHint = $('portHint');

const messageInput = $('messageInput');
const durationInput = $('durationInput');
const crlfCheckbox = $('crlfCheckbox');
const sendBtn = $('sendBtn');

const responseBox = $('responseBox');
const logBox = $('logBox');
const clearLogBtn = $('clearLogBtn');

let connected = false;
let currentPortPath = '';
let currentConnectionId = 0;

function fmtTs(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function log(line) {
  logBox.textContent += `${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function setStatus(isConnected, details = '') {
  connected = isConnected;
  statusBadge.textContent = isConnected ? `Conectado ${details}` : 'Desconectado';
  statusBadge.classList.toggle('connected', isConnected);
  connectBtn.disabled = isConnected;
  disconnectBtn.disabled = !isConnected;
  sendBtn.disabled = !isConnected;
}

function optionLabel(p) {
  const extra =
    p.friendlyName ||
    p.manufacturer ||
    p.serialNumber ||
    [p.vendorId && `VID:${p.vendorId}`, p.productId && `PID:${p.productId}`].filter(Boolean).join(' ');
  return extra ? `${p.path} — ${extra}` : p.path;
}

async function refreshPorts() {
  portHint.textContent =
    'Observação: o “baud rate” do RS232 é configurado no próprio BS1C (não no link Bluetooth).';
  portSelect.innerHTML = '';

  /** @type {Array<{path:string,friendlyName?:string,manufacturer?:string,serialNumber?:string,vendorId?:string,productId?:string}>} */
  let ports = [];
  try {
    ports = await bs1c.listPorts();
  } catch (err) {
    portHint.textContent = `Erro ao listar portas: ${err?.message ?? String(err)}`;
    return;
  }

  if (!ports.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhuma porta encontrada';
    portSelect.appendChild(opt);
    return;
  }

  // macOS: normalmente prefira /dev/cu.* para saída (evita alguns closes imediatos em /dev/tty.*)
  ports.sort((a, b) => {
    const aCu = a.path.includes('/dev/cu.');
    const bCu = b.path.includes('/dev/cu.');
    if (aCu === bCu) return a.path.localeCompare(b.path);
    return aCu ? -1 : 1;
  });

  for (const p of ports) {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = optionLabel(p);
    portSelect.appendChild(opt);
  }

  // Tenta pré-selecionar algo "cu.*" no macOS (geralmente melhor pra saída).
  const prefer = ports.find((p) => p.path.includes('/dev/cu.'));
  if (prefer) portSelect.value = prefer.path;
}

async function connect() {
  responseBox.textContent = '';
  portHint.textContent =
    'Observação: o “baud rate” do RS232 é configurado no próprio BS1C (não no link Bluetooth).';

  const path = portSelect.value;

  if (!path) {
    portHint.textContent = 'Selecione uma porta.';
    return;
  }

  if (path.includes('/dev/tty.')) {
    portHint.textContent =
      'Dica (macOS): se existir uma porta /dev/cu.*, prefira ela. /dev/tty.* pode fechar imediatamente em alguns casos.';
  }

  log(`[${fmtTs(Date.now())}] Conectando em ${path}...`);

  try {
    const res = await bs1c.connect({ path });
    currentPortPath = res.path;
    currentConnectionId = res.connectionId ?? 0;
    setStatus(true, `(${currentPortPath})`);
    log(`[${fmtTs(Date.now())}] OK conectado em ${currentPortPath}`);
  } catch (err) {
    setStatus(false);
    portHint.textContent = `Falha ao conectar: ${err?.message ?? String(err)}`;
    log(`[${fmtTs(Date.now())}] ERRO conectar: ${err?.message ?? String(err)}`);
  }
}

async function disconnect() {
  try {
    await bs1c.disconnect();
  } finally {
    currentPortPath = '';
    currentConnectionId = 0;
    setStatus(false);
    log(`[${fmtTs(Date.now())}] Desconectado`);
  }
}

async function sendAndListen() {
  responseBox.textContent = '';
  const message = messageInput.value ?? '';
  const durationMs = Number(durationInput.value) || 1000;
  const appendCRLF = !!crlfCheckbox.checked;

  log(`[${fmtTs(Date.now())}] Enviando: ${JSON.stringify(message)} (CRLF=${appendCRLF}) e escutando ${durationMs}ms...`);

  sendBtn.disabled = true;
  try {
    const res = await bs1c.writeAndCapture({ message, durationMs, appendCRLF });
    responseBox.textContent = res.received || '(sem resposta no período)';
    log(
      `[${fmtTs(Date.now())}] Captura finalizada: bytes=${res.receivedBytes} duração=${res.durationMs}ms`,
    );
  } catch (err) {
    responseBox.textContent = `Erro: ${err?.message ?? String(err)}`;
    log(`[${fmtTs(Date.now())}] ERRO envio/captura: ${err?.message ?? String(err)}`);
  } finally {
    sendBtn.disabled = !connected;
  }
}

refreshPortsBtn.addEventListener('click', refreshPorts);
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
sendBtn.addEventListener('click', sendAndListen);
clearLogBtn.addEventListener('click', () => (logBox.textContent = ''));

// Eventos “ao vivo” (úteis pra depurar stream contínuo).
bs1c.onSerialData((payload) => {
  if (!payload?.data) return;
  if (payload?.connectionId && payload.connectionId !== currentConnectionId) return;
  log(`[${fmtTs(payload.ts)}] RX(${payload.bytes}): ${JSON.stringify(payload.data)}`);
});
bs1c.onSerialError((payload) => {
  if (payload?.connectionId && payload.connectionId !== currentConnectionId) return;
  log(`[${fmtTs(payload.ts)}] ERRO serial: ${payload?.message ?? '(sem mensagem)'}`);
});
bs1c.onSerialClosed((payload) => {
  log(`[${fmtTs(payload.ts)}] Porta fechada (${payload?.path ?? ''})`);
  const isCurrent =
    (payload?.connectionId && payload.connectionId === currentConnectionId) ||
    (!payload?.connectionId && payload?.path && payload.path === currentPortPath);
  if (isCurrent) {
    currentPortPath = '';
    currentConnectionId = 0;
    setStatus(false);
  }
});

// init
setStatus(false);
refreshPorts();


