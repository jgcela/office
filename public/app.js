import { AGENTS, CONTEXT, SAMPLES, PERSON, ROBOT } from './agents.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => new Date().toTimeString().slice(0, 8);
const today = () => new Date().toISOString().slice(0, 10);

const state = {
  cfg: AGENTS.map((a) => ({ prompt: a.prompt, on: a.on })),
  context: CONTEXT,
  sel: 0,
  queue: [],
  current: null,
  live: '',
  view: null,
  drafts: [],
  sample: 0,
  ready: false,
  busy: false,
  log: []
};

// --- Cuota diaria (solo para no gastar de más; la real la pone tu cuenta de Anthropic) ---
function loadQuota() {
  try {
    const q = JSON.parse(localStorage.getItem('oficina-quota') || 'null');
    if (q && q.day === today()) return q.left;
  } catch {}
  return 100;
}
let quota = loadQuota();
function setQuota(n) {
  quota = Math.max(0, n);
  try { localStorage.setItem('oficina-quota', JSON.stringify({ day: today(), left: quota })); } catch {}
  renderQuota();
}

// --- Registro ---
function addLog(text) {
  state.log.unshift({ time: now(), text });
  state.log = state.log.slice(0, 10);
  $('log').innerHTML = state.log.map((l) => `<li><time>${l.time}</time><span>${esc(l.text)}</span></li>`).join('');
}

// --- Sprites con box-shadow ---
function spriteShadow(a) {
  const P = 6;
  const pal = a.robot
    ? { a: '#4CAF50', r: '#8E97A8', k: '#2E3440', q: '#5BC0F0' }
    : { h: a.hair, s: a.skin, e: '#1E1B18', m: '#B5654A', b: a.shirt, g: '#1E1B18' };
  let map = (a.robot ? ROBOT : PERSON).slice();
  if (!a.robot && a.style === 'long') map = map.map((row, y) => (y < 3 || y > 9) ? row : row[0] + 'h' + row.slice(2, 10) + 'h' + row.slice(11));
  if (!a.robot && a.style === 'shades') { map[5] = '.sggggggggs.'; map[6] = '.ssggssggss.'; }
  const parts = [];
  map.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) parts.push(`${x * P}px ${y * P}px 0 0 ${pal[ch]}`); }));
  return parts.join(',');
}
const PROPS = {
  chart: '<div class="prop prop-chart"><i style="height:10px"></i><i style="height:16px"></i><i style="height:12px"></i><i style="height:20px"></i></div>',
  papers: '<div class="prop prop-papers"><i></i><i></i></div>',
  sticky: '<div class="prop prop-sticky"><i></i><i></i></div>',
  books: '<div class="prop prop-books"><i></i><i></i></div>'
};
const SHADOWS = AGENTS.map(spriteShadow);

// --- Render de la oficina ---
function bossMessage() {
  const cur = state.current;
  if (!state.ready) return 'Sin conexión con Claude.';
  if (quota <= 0) return 'Sin cuota. Toca recargar.';
  if (cur && cur.stage >= 0) return `«${cur.title}» → ${AGENTS[cur.stage].name}`;
  if (cur || state.queue.length) return 'Repartiendo trabajo…';
  return '¡Todo al día! Pídeme algo.';
}

function renderFloor() {
  const cur = state.current;
  const firstOn = state.cfg.findIndex((c) => c.on);
  const desks = AGENTS.map((a, i) => {
    const c = state.cfg[i];
    const working = !!cur && cur.stage === i;
    const done = !!cur && cur.stage > i && c.on;
    const bubble = i === (firstOn < 0 ? 0 : firstOn) ? bossMessage() : (working ? 'Trabajando…' : '');
    const dot = !c.on ? '#FFFDF8' : working ? '#F2A71B' : done ? '#2E9E4F' : '#B9B1A4';
    const status = !c.on ? 'descanso' : working ? 'trabajando' : done ? 'hecho' : 'libre';
    return `<button type="button" class="desk" data-i="${i}" aria-pressed="${state.sel === i}" aria-label="Editar especialidad de ${esc(a.name)}">
      <div class="bubble-row">${bubble ? `<div class="bubble">${esc(bubble)}</div>` : ''}</div>
      <div class="scene${c.on ? '' : ' off'}">
        <div class="chair"></div>
        <div class="sprite${working ? ' bob' : ''}"><i style="box-shadow:${SHADOWS[i]}"></i></div>
        <div class="laptop"></div>
        ${working ? '<div class="glow"></div>' : ''}
        <div class="desktop"></div>
        <div class="mug"></div>
        ${a.prop ? PROPS[a.prop] : ''}
      </div>
      <div class="name-row"><span class="dot" style="background:${dot}" aria-hidden="true"></span><span class="desk-name">${esc(a.name)}</span></div>
      <span class="status">${esc(a.phase)} · ${status}</span>
    </button>`;
  }).join('');
  const printer = `<div class="desk" style="cursor:default">
      <div class="bubble-row"></div>
      <div class="printer" aria-hidden="true"><div class="paper"><i></i><i></i></div><div class="body"><div class="slot"></div><div class="light${state.drafts.length ? ' on' : ''}"></div></div><div class="tray"></div></div>
      <span class="desk-name">Borradores · ${state.drafts.length}</span>
      <span class="status">carpeta drafts/</span>
    </div>`;
  $('floor').innerHTML = desks + printer;
}

function renderCounts() {
  const working = state.current ? 1 : 0;
  $('c-line1').textContent = `En cola: ${state.queue.length} · Trabajando: ${working}`;
  $('c-line2').textContent = `Esperando cuota: ${quota <= 0 ? state.queue.length + working : 0}`;
  $('c-line3').textContent = `Listos: ${state.drafts.length}`;
}

function renderQuota() {
  $('quota-label').textContent = `IA ${quota}/100`;
  const fill = $('battery-fill');
  fill.style.width = quota + '%';
  fill.style.background = quota > 30 ? '#2E9E4F' : quota > 10 ? '#F2A71B' : '#D63B2F';
  renderCounts();
}

function renderEditor() {
  const a = AGENTS[state.sel];
  const c = state.cfg[state.sel];
  $('sel-title').textContent = 'Mesa de ' + a.name;
  $('sel-on').checked = !!c.on;
  $('especialidad').value = c.prompt;
}

function renderView() {
  const cur = state.current;
  let title, text, copy = false;
  if (cur && cur.stage >= 0) {
    title = 'En la mesa de ' + AGENTS[cur.stage].name;
    text = state.live || 'Pensando…';
  } else if (state.view) {
    title = 'Borrador: ' + state.view.title;
    text = state.view.text;
    copy = true;
  } else {
    title = 'En la mesa ahora';
    text = 'Aquí verás lo que escribe cada agente mientras trabaja.';
  }
  $('view-title').textContent = title;
  const box = $('view-text');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  box.textContent = text;
  if (cur && atBottom) box.scrollTop = box.scrollHeight;
  $('copy-row').hidden = !copy;
  $('drafts-box').hidden = !state.drafts.length;
  $('drafts').innerHTML = state.drafts.map((d, i) => `<button type="button" data-d="${i}" title="${esc(d.title)}">${esc(d.title)}</button>`).join('');
}

function renderAll() { renderFloor(); renderCounts(); renderView(); }

// --- Guardado de la configuración en el servidor (data/config.json) ---
let saveTimer;
function saveConfig() {
  $('save-msg').textContent = 'Guardando…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cfg: state.cfg, context: state.context }) });
      if (!r.ok) throw new Error();
      $('save-msg').textContent = 'Guardado en data/config.json';
    } catch {
      $('save-msg').textContent = 'No se pudo guardar. ¿Está el servidor encendido?';
    }
  }, 500);
}

// --- Llamada a un agente (streaming desde el servidor) ---
async function callAgent(i, title, prev) {
  const a = AGENTS[i];
  const system = `${state.context}\n\nEres "${a.name}", un miembro del equipo dentro de una cadena de trabajo.\n\nTu rol:\n${state.cfg[i].prompt}`;
  const prompt = `Petición original: ${title}\n\nTrabajo recibido del agente anterior:\n${prev || '(eres el primero de la cadena)'}\n\nResponde en el idioma de la petición. Devuelve solo tu resultado, sin preámbulos ni comentarios sobre el proceso.`;
  const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, prompt }) });
  if (!res.ok) {
    let msg = 'Error ' + res.status;
    try { msg = (await res.json()).error || msg; } catch {}
    throw Object.assign(new Error(msg), { status: res.status });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    state.live = text;
    renderView();
  }
  return text;
}

async function runQueue() {
  if (state.busy || !state.ready || !state.queue.length || quota <= 0) return;
  const order = state.cfg.map((c, i) => (c.on ? i : -1)).filter((i) => i >= 0);
  if (!order.length) { addLog('No hay agentes activos. Activa al menos uno.'); return; }

  state.busy = true;
  const task = state.queue.shift();
  state.current = { title: task.title, stage: -1 };
  state.live = '';
  state.view = null;
  addLog(`El equipo recibe «${task.title}»`);
  renderAll();

  let prev = '';
  const sections = [];
  let ok = true;
  for (const i of order) {
    if (quota <= 0) { addLog(`Sin cuota: «${task.title}» vuelve a la cola.`); state.queue.unshift(task); ok = false; break; }
    state.current.stage = i;
    state.live = '';
    addLog(`${AGENTS[i].name} trabaja en «${task.title}»`);
    renderAll();
    try {
      prev = await callAgent(i, task.title, prev);
      sections.push(`## ${AGENTS[i].name}\n\n${prev.trim()}`);
      setQuota(quota - 1);
    } catch (err) {
      if (err.status === 429) addLog(`Anthropic pide una pausa (límite de uso). «${task.title}» vuelve a la cola.`);
      else addLog(`Error en ${AGENTS[i].name}: ${err.message}. «${task.title}» vuelve a la cola.`);
      state.queue.unshift(task);
      ok = false;
      break;
    }
  }

  if (ok) {
    const md = `# ${task.title}\n\n_${new Date().toLocaleString('es-ES')} · ${order.map((i) => AGENTS[i].name).join(' → ')}_\n\n${sections.join('\n\n---\n\n')}\n`;
    try {
      await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: task.title, text: md }) });
    } catch {}
    state.drafts.push({ title: task.title, text: md });
    state.view = state.drafts[state.drafts.length - 1];
    addLog(`«${task.title}» guardado en drafts/`);
  }
  state.current = null;
  state.live = '';
  state.busy = false;
  renderAll();
  if (ok) setTimeout(runQueue, 300);
}

function enqueue(title) {
  state.queue.push({ title });
  addLog(`Nueva tarea en cola: «${title}»`);
  if (!state.ready) addLog('Claude no está conectado: revisa ANTHROPIC_API_KEY en .env y reinicia el servidor.');
  renderAll();
  runQueue();
}

// --- Eventos ---
$('floor').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  state.sel = Number(b.dataset.i);
  renderFloor();
  renderEditor();
});
$('especialidad').addEventListener('input', (e) => { state.cfg[state.sel].prompt = e.target.value; saveConfig(); });
$('sel-on').addEventListener('change', (e) => { state.cfg[state.sel].on = e.target.checked; saveConfig(); renderFloor(); });
$('reset').addEventListener('click', () => { state.cfg[state.sel].prompt = AGENTS[state.sel].prompt; renderEditor(); saveConfig(); });
$('context').addEventListener('input', (e) => { state.context = e.target.value; saveConfig(); });
$('reset-context').addEventListener('click', () => { state.context = CONTEXT; $('context').value = CONTEXT; saveConfig(); });
$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('tarea').value.trim();
  if (!t) return;
  $('tarea').value = '';
  enqueue(t);
});
$('sample').addEventListener('click', () => enqueue(SAMPLES[state.sample++ % SAMPLES.length]));
$('recharge').addEventListener('click', () => { setQuota(100); addLog('Cuota recargada: 100/100'); runQueue(); });
$('drafts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]');
  if (!b || state.current) return;
  state.view = state.drafts[Number(b.dataset.d)];
  $('copy-msg').textContent = '';
  renderView();
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.view.text); $('copy-msg').textContent = 'Copiado.'; }
  catch { $('copy-msg').textContent = 'No se pudo copiar; selecciónalo a mano.'; }
});

// --- Arranque ---
async function init() {
  addLog('La oficina abre.');
  try {
    const st = await (await fetch('/api/status')).json();
    state.ready = st.ready;
    $('mode').textContent = st.ready ? `Conectado a Claude · ${st.model}` : 'Falta la API key';
    $('mode').className = 'chip ' + (st.ready ? 'ok' : 'bad');
    if (!st.ready) addLog('Falta ANTHROPIC_API_KEY. Copia .env.example a .env, pon tu clave y reinicia con npm start.');
  } catch {
    $('mode').textContent = 'Servidor apagado';
    $('mode').className = 'chip bad';
  }
  try {
    const conf = await (await fetch('/api/config')).json();
    if (Array.isArray(conf.cfg) && conf.cfg.length === AGENTS.length) state.cfg = conf.cfg;
    if (typeof conf.context === 'string') state.context = conf.context;
    $('save-msg').textContent = conf.cfg ? 'Guardado en data/config.json' : 'Configuración por defecto';
  } catch {
    $('save-msg').textContent = 'No se pudo leer la configuración';
  }
  try {
    const { drafts } = await (await fetch('/api/drafts')).json();
    for (const d of drafts) {
      const { text } = await (await fetch('/api/drafts/' + encodeURIComponent(d.file))).json();
      state.drafts.push({ title: d.title, text });
    }
  } catch {}
  $('context').value = state.context;
  renderQuota();
  renderEditor();
  renderAll();
}
init();
