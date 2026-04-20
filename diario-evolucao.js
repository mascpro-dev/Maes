/* ============================================================
   Aura — Diário de Evolução Clínica (Supabase + fallback local)
   ============================================================ */

const DIARY_TABLE = 'diary_entries';
const AUDIO_BUCKET = 'diary-audio';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const SAMPLE_WEEKS = [
  { marcos: [4, 5, 3, 6, 5, 7, 5], crises: [2, 1, 3, 2, 1, 2, 1], medicacao: [1, 1, 0, 2, 1, 1, 1] },
  { marcos: [3, 4, 5, 4, 6, 5, 6], crises: [3, 2, 2, 1, 2, 1, 0], medicacao: [0, 1, 1, 0, 1, 0, 1] },
  { marcos: [5, 5, 6, 7, 6, 8, 7], crises: [1, 2, 1, 1, 2, 1, 1], medicacao: [2, 1, 1, 1, 0, 2, 1] },
];

const STORAGE_KEY = 'aura-diario-v1';
const MAX_AUDIO_BYTES = 1_200_000;

function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatRange(start, end) {
  const ds = start.getDate();
  const de = end.getDate();
  const ms = MONTHS_SHORT[start.getMonth()];
  const me = MONTHS_SHORT[end.getMonth()];
  if (start.getMonth() === end.getMonth()) {
    return `${ds}–${de} ${me} ${start.getFullYear()}`;
  }
  return `${ds} ${ms} – ${de} ${me} ${end.getFullYear()}`;
}

function valueToY(v, vmin, vmax, yBottom, yTop) {
  const t = (v - vmin) / (vmax - vmin);
  return yBottom - t * (yBottom - yTop);
}

function pointsFromValues(values, x0, x1, yBottom, yTop, vmin, vmax) {
  const n = values.length;
  const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
  return values.map((v, i) => ({
    x: x0 + i * step,
    y: valueToY(Math.min(vmax, Math.max(vmin, v)), vmin, vmax, yBottom, yTop),
  }));
}

function smoothPathThrough(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaUnderLine(lineD, baselineY) {
  if (!lineD || lineD.length < 2) return '';
  const matchM = lineD.match(/M\s*([\d.]+)\s*([\d.]+)/);
  if (!matchM) return '';
  const x0 = parseFloat(matchM[1]);
  const lastCoords = lineD.match(/([\d.]+)\s+([\d.]+)\s*$/);
  if (!lastCoords) return '';
  const x1 = parseFloat(lastCoords[1]);
  return `${lineD} L ${x1} ${baselineY} L ${x0} ${baselineY} Z`;
}

function renderDots(group, pts, r) {
  group.innerHTML = '';
  pts.forEach((p) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', String(r));
    c.setAttribute('opacity', '0.92');
    group.appendChild(c);
  });
}

const Y_LABEL_YS = [32, 62, 92, 122, 142];

function niceCeilMax(n) {
  if (n <= 4) return 4;
  if (n <= 6) return 6;
  if (n <= 8) return 8;
  return Math.ceil(n / 2) * 2;
}

function renderYAxisLabels(group, vmax) {
  if (!group) return;
  group.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const v = Math.round((vmax * (4 - i)) / 4);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', '30');
    t.setAttribute('y', String(Y_LABEL_YS[i]));
    t.setAttribute('text-anchor', 'end');
    t.textContent = String(v);
    group.appendChild(t);
  }
}

function renderXAxisLabels(group, pts, weekdays) {
  if (!group || !pts.length) return;
  group.innerHTML = '';
  const y = 166;
  pts.forEach((p, i) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(p.x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', 'middle');
    t.textContent = weekdays[i] || '';
    group.appendChild(t);
  });
}

function showToast(message) {
  document.querySelectorAll('.aura-toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = 'aura-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '96px',
    left: '50%',
    transform: 'translateX(-50%) translateY(12px)',
    background: 'rgba(45,42,38,.92)',
    color: '#f5efe4',
    padding: '11px 20px',
    borderRadius: '40px',
    fontSize: '.82rem',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: '500',
    boxShadow: '0 8px 32px rgba(0,0,0,.22)',
    backdropFilter: 'blur(12px)',
    zIndex: '9999',
    opacity: '0',
    transition: 'all .28s cubic-bezier(.32,.72,0,1)',
    maxWidth: '90vw',
    textAlign: 'center',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function loadDiarioStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dayDeltas: {}, entries: [] };
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return { dayDeltas: {}, entries: [] };
    if (!p.dayDeltas || typeof p.dayDeltas !== 'object') p.dayDeltas = {};
    if (!Array.isArray(p.entries)) p.entries = [];
    return p;
  } catch {
    return { dayDeltas: {}, entries: [] };
  }
}

function saveDiarioStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function dateKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bumpDayDelta(store, dateKey, kind) {
  if (!store.dayDeltas[dateKey]) store.dayDeltas[dateKey] = { marcos: 0, crises: 0, medicacao: 0 };
  if (kind === 'marco') store.dayDeltas[dateKey].marcos += 1;
  else if (kind === 'crise') store.dayDeltas[dateKey].crises += 1;
  else if (kind === 'medicacao') store.dayDeltas[dateKey].medicacao += 1;
}

function pushDiarioEntry(store, payload) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `e-${Date.now()}`;
  store.entries.push({
    id,
    dateKey: payload.dateKey,
    kind: payload.kind,
    mode: payload.mode,
    text: payload.text,
    audioDataUrl: payload.audioDataUrl,
    medicationName: payload.medicationName,
    medicationGivenAt: payload.medicationGivenAt,
    createdAt: new Date().toISOString(),
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Leitura do áudio falhou'));
    r.readAsDataURL(blob);
  });
}

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function aggregateEntryRows(rows) {
  const byDay = {};
  for (const r of rows || []) {
    let dk = r.entry_date;
    if (dk && typeof dk === 'string') dk = dk.slice(0, 10);
    if (!dk) continue;
    if (!byDay[dk]) byDay[dk] = { marcos: 0, crises: 0, medicacao: 0 };
    if (r.kind === 'marco') byDay[dk].marcos += 1;
    else if (r.kind === 'crise') byDay[dk].crises += 1;
    else if (r.kind === 'medicacao') byDay[dk].medicacao += 1;
  }
  return byDay;
}

/** input type=time \"HH:MM\" → Postgres time \"HH:MM:SS\" */
function timeInputToPg(val) {
  if (!val || typeof val !== 'string') return null;
  const t = val.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function formatTimeForDisplay(pg) {
  if (pg == null || pg === '') return '';
  const s = String(pg);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

async function main() {
  if (!window.__auraAuthReady) {
    console.warn('[Aura] diario: falta auth-session-guard.js');
    return;
  }
  const authOk = await window.__auraAuthReady;
  if (!authOk) return;

  const supabase = window.__auraSupabaseClient;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;

  /** null = usar localStorage no gráfico; objeto = contagens só da nuvem para a semana */
  let weekDbCounts = null;

  const strip = document.getElementById('diario-week-strip');
  const labelEl = document.getElementById('diario-week-label');
  const btnPrev = document.getElementById('diario-week-prev');
  const btnNext = document.getElementById('diario-week-next');
  const lineMarcos = document.getElementById('diario-line-marcos');
  const lineCrises = document.getElementById('diario-line-crises');
  const lineMedicacao = document.getElementById('diario-line-medicacao');
  const areaMarcos = document.getElementById('diario-area-marcos');
  const areaCrises = document.getElementById('diario-area-crises');
  const areaMedicacao = document.getElementById('diario-area-medicacao');
  const dotsMarcos = document.getElementById('diario-dots-marcos');
  const dotsCrises = document.getElementById('diario-dots-crises');
  const dotsMedicacao = document.getElementById('diario-dots-medicacao');
  const yLabels = document.getElementById('diario-y-labels');
  const xLabels = document.getElementById('diario-x-labels');

  const fab = document.getElementById('diario-fab');
  const menu = document.getElementById('diario-fab-menu');
  const backdrop = document.getElementById('diario-fab-backdrop');
  const optAudio = document.getElementById('diario-opt-audio');
  const optTexto = document.getElementById('diario-opt-texto');
  const btnRel = document.getElementById('diario-btn-relatorio');

  const textBackdrop = document.getElementById('diario-text-backdrop');
  const textSheet = document.getElementById('diario-sheet-text');
  const textDayEl = document.getElementById('diario-sheet-text-day');
  const textField = document.getElementById('diario-text-field');
  const textCancel = document.getElementById('diario-text-cancel');
  const textSave = document.getElementById('diario-text-save');

  const audioBackdrop = document.getElementById('diario-audio-backdrop');
  const audioSheet = document.getElementById('diario-sheet-audio');
  const audioDayEl = document.getElementById('diario-sheet-audio-day');
  const audioToggle = document.getElementById('diario-audio-toggle');
  const audioHint = document.getElementById('diario-audio-hint');
  const audioPreviewWrap = document.getElementById('diario-audio-preview-wrap');
  const audioPreview = document.getElementById('diario-audio-preview');
  const audioCancel = document.getElementById('diario-audio-cancel');
  const audioSave = document.getElementById('diario-audio-save');

  const textBlockMarco = document.getElementById('diario-text-block-marco');
  const textBlockMed = document.getElementById('diario-text-block-med');
  const textMedName = document.getElementById('diario-text-med-name');
  const textMedTime = document.getElementById('diario-text-med-time');
  const textMedNotes = document.getElementById('diario-text-med-notes');

  const audioBlockMed = document.getElementById('diario-audio-block-med');
  const audioMedName = document.getElementById('diario-audio-med-name');
  const audioMedTime = document.getElementById('diario-audio-med-time');

  if (!strip || !labelEl) return;

  const today = new Date();
  let weekStart = startOfWeekMonday(today);
  let weekOffset = 0;
  let selectedIndex = (() => {
    const s = startOfWeekMonday(today);
    for (let i = 0; i < 7; i++) {
      const d = addDays(s, i);
      if (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      ) {
        return i;
      }
    }
    return 0;
  })();

  async function refreshWeekEntriesFromDb() {
    if (!supabase || !userId) {
      weekDbCounts = null;
      return;
    }
    const start = dateKeyLocal(weekStart);
    const end = dateKeyLocal(addDays(weekStart, 6));
    const { data, error } = await supabase
      .from(DIARY_TABLE)
      .select('entry_date, kind')
      .eq('user_id', userId)
      .gte('entry_date', start)
      .lte('entry_date', end);
    if (error) {
      console.warn('[Aura] diary_entries:', error.message);
      weekDbCounts = null;
      return;
    }
    weekDbCounts = aggregateEntryRows(data);
  }

  function weekDataIndex() {
    return ((weekOffset % SAMPLE_WEEKS.length) + SAMPLE_WEEKS.length) % SAMPLE_WEEKS.length;
  }

  function getMergedWeekSeries() {
    const data = SAMPLE_WEEKS[weekDataIndex()];
    const marcos = [...data.marcos];
    const crises = [...data.crises];
    const medicacao = [...(data.medicacao || [0, 0, 0, 0, 0, 0, 0])];
    const local = loadDiarioStore();
    for (let i = 0; i < 7; i++) {
      const k = dateKeyLocal(addDays(weekStart, i));
      if (weekDbCounts !== null) {
        const d = weekDbCounts[k];
        if (d) {
          marcos[i] += d.marcos || 0;
          crises[i] += d.crises || 0;
          medicacao[i] += d.medicacao || 0;
        }
      }
      const loc = local.dayDeltas[k];
      if (loc) {
        marcos[i] += loc.marcos || 0;
        crises[i] += loc.crises || 0;
        medicacao[i] += loc.medicacao || 0;
      }
    }
    return { marcos, crises, medicacao };
  }

  function selectedDateKey() {
    return dateKeyLocal(addDays(weekStart, selectedIndex));
  }

  function formatSelectedDayLabel() {
    const d = addDays(weekStart, selectedIndex);
    return `${WEEKDAYS[selectedIndex]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }

  function drawChart() {
    const data = getMergedWeekSeries();
    const x0 = 36;
    const x1 = 304;
    const yTop = 28;
    const yBottom = 138;
    const vmin = 0;
    const peak = Math.max(1, ...data.marcos, ...data.crises, ...data.medicacao);
    const vmax = niceCeilMax(peak);

    const pm = pointsFromValues(data.marcos, x0, x1, yBottom, yTop, vmin, vmax);
    const pc = pointsFromValues(data.crises, x0, x1, yBottom, yTop, vmin, vmax);
    const pz = pointsFromValues(data.medicacao, x0, x1, yBottom, yTop, vmin, vmax);

    const dM = smoothPathThrough(pm);
    const dC = smoothPathThrough(pc);
    const dZ = smoothPathThrough(pz);
    lineMarcos.setAttribute('d', dM);
    lineCrises.setAttribute('d', dC);
    if (lineMedicacao) lineMedicacao.setAttribute('d', dZ);
    areaMarcos.setAttribute('d', areaUnderLine(dM, yBottom));
    areaCrises.setAttribute('d', areaUnderLine(dC, yBottom));
    if (areaMedicacao) areaMedicacao.setAttribute('d', areaUnderLine(dZ, yBottom));
    renderDots(dotsMarcos, pm, 3.5);
    renderDots(dotsCrises, pc, 3.5);
    if (dotsMedicacao) renderDots(dotsMedicacao, pz, 3.5);
    renderYAxisLabels(yLabels, vmax);
    renderXAxisLabels(xLabels, pm, WEEKDAYS);
  }

  function syncTextKindBlocks() {
    const input = document.querySelector('input[name="diario-text-kind"]:checked');
    const kind = input && input.value;
    const isMed = kind === 'medicacao';
    if (textBlockMarco) textBlockMarco.hidden = isMed;
    if (textBlockMed) textBlockMed.hidden = !isMed;
  }

  function syncAudioKindBlocks() {
    const input = document.querySelector('input[name="diario-audio-kind"]:checked');
    const isMed = input && input.value === 'medicacao';
    if (audioBlockMed) audioBlockMed.hidden = !isMed;
  }

  async function persistTextToCloud(kind, dateKey, textContent, med) {
    if (!supabase || !userId) return { ok: false };
    const row = {
      user_id: userId,
      entry_date: dateKey,
      kind,
      mode: 'text',
      text_content: kind === 'medicacao' ? textContent || null : textContent,
      audio_storage_path: null,
      medication_name: kind === 'medicacao' && med ? med.name : null,
      medication_given_at: kind === 'medicacao' && med ? med.timePg : null,
    };
    const { error } = await supabase.from(DIARY_TABLE).insert(row);
    if (error) {
      console.warn('[Aura] diary text insert:', error.message);
      return { ok: false, error };
    }
    await refreshWeekEntriesFromDb();
    return { ok: true };
  }

  async function persistAudioToCloud(kind, dateKey, blob, medOptional) {
    if (!supabase || !userId) return { ok: false };
    const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const fileName = `${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`;
    const path = `${userId}/${fileName}`;
    const { error: upErr } = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, {
      contentType: blob.type || 'audio/webm',
      upsert: false,
    });
    if (upErr) {
      console.warn('[Aura] diary-audio:', upErr.message);
      return { ok: false, error: upErr };
    }
    const { error: insErr } = await supabase.from(DIARY_TABLE).insert({
      user_id: userId,
      entry_date: dateKey,
      kind,
      mode: 'audio',
      text_content: null,
      audio_storage_path: path,
      medication_name: kind === 'medicacao' ? medOptional?.name || null : null,
      medication_given_at: kind === 'medicacao' ? medOptional?.timePg || null : null,
    });
    if (insErr) {
      await supabase.storage.from(AUDIO_BUCKET).remove([path]);
      console.warn('[Aura] diary audio row:', insErr.message);
      return { ok: false, error: insErr };
    }
    await refreshWeekEntriesFromDb();
    return { ok: true };
  }

  function saveTextLocalFallback(kind, dateKey, textBody, med) {
    const store = loadDiarioStore();
    bumpDayDelta(store, dateKey, kind);
    pushDiarioEntry(store, {
      dateKey,
      kind,
      mode: 'text',
      text: textBody,
      medicationName: med && med.name,
      medicationGivenAt: med && med.timeDisplay,
    });
    saveDiarioStore(store);
  }

  async function saveAudioLocalFallback(kind, dateKey, blob, med) {
    const audioDataUrl = await blobToDataUrl(blob);
    const store = loadDiarioStore();
    bumpDayDelta(store, dateKey, kind);
    pushDiarioEntry(store, {
      dateKey,
      kind,
      mode: 'audio',
      audioDataUrl,
      medicationName: kind === 'medicacao' ? med?.name : undefined,
      medicationGivenAt: kind === 'medicacao' ? med?.timeDisplay : undefined,
    });
    saveDiarioStore(store);
  }

  async function renderWeek() {
    strip.innerHTML = '';
    const end = addDays(weekStart, 6);
    labelEl.textContent = formatRange(weekStart, end);

    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'diario-day' + (i === selectedIndex ? ' diario-day--selected' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', i === selectedIndex ? 'true' : 'false');
      btn.dataset.index = String(i);

      const w = document.createElement('span');
      w.className = 'diario-day__weekday';
      w.textContent = WEEKDAYS[i];

      const n = document.createElement('span');
      n.className = 'diario-day__num';
      n.textContent = String(d.getDate());

      btn.appendChild(w);
      btn.appendChild(n);
      btn.addEventListener('click', async () => {
        selectedIndex = i;
        await renderWeek();
      });
      strip.appendChild(btn);
    }
    await refreshWeekEntriesFromDb();
    drawChart();
  }

  btnPrev.addEventListener('click', async () => {
    weekStart = addDays(weekStart, -7);
    weekOffset -= 1;
    await renderWeek();
  });
  btnNext.addEventListener('click', async () => {
    weekStart = addDays(weekStart, 7);
    weekOffset += 1;
    await renderWeek();
  });

  function closeFabMenu() {
    if (!menu || !fab) return;
    menu.hidden = true;
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    fab.classList.remove('diario-fab--open');
    fab.setAttribute('aria-expanded', 'false');
  }

  function openFabMenu() {
    menu.hidden = false;
    backdrop.hidden = false;
    backdrop.setAttribute('aria-hidden', 'false');
    fab.classList.add('diario-fab--open');
    fab.setAttribute('aria-expanded', 'true');
  }

  function openTextSheet() {
    if (textDayEl) textDayEl.textContent = formatSelectedDayLabel();
    if (textField) textField.value = '';
    if (textMedName) textMedName.value = '';
    if (textMedTime) textMedTime.value = '';
    if (textMedNotes) textMedNotes.value = '';
    const marco = document.querySelector('input[name="diario-text-kind"][value="marco"]');
    if (marco) marco.checked = true;
    syncTextKindBlocks();
    if (textSheet) textSheet.hidden = false;
    if (textBackdrop) {
      textBackdrop.hidden = false;
      textBackdrop.setAttribute('aria-hidden', 'false');
    }
    const kindInput = document.querySelector('input[name="diario-text-kind"]:checked');
    if (kindInput && kindInput.value === 'medicacao' && textMedName) textMedName.focus();
    else if (textField) textField.focus();
  }

  function closeTextSheet() {
    if (textSheet) textSheet.hidden = true;
    if (textBackdrop) {
      textBackdrop.hidden = true;
      textBackdrop.setAttribute('aria-hidden', 'true');
    }
  }

  let audioStream = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedBlob = null;
  let recordingActive = false;
  let previewObjectUrl = null;

  function revokeAudioPreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    if (audioPreview) audioPreview.removeAttribute('src');
    if (audioPreviewWrap) audioPreviewWrap.hidden = true;
  }

  function discardRecordingSession() {
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    } catch {
      /* ignore */
    }
    if (audioStream) {
      audioStream.getTracks().forEach((t) => t.stop());
      audioStream = null;
    }
    mediaRecorder = null;
    audioChunks = [];
    recordingActive = false;
  }

  function resetAudioModal() {
    discardRecordingSession();
    revokeAudioPreview();
    recordedBlob = null;
    if (audioToggle) {
      audioToggle.classList.remove('diario-audio-rec--stop');
      audioToggle.setAttribute('aria-pressed', 'false');
      audioToggle.setAttribute('aria-label', 'Iniciar gravação');
    }
    if (audioSave) audioSave.disabled = true;
    if (audioHint) {
      audioHint.textContent =
        'Toque no microfone para gravar (até ~2 min). Pare quando terminar e ouça antes de salvar.';
    }
    const marco = document.querySelector('input[name="diario-audio-kind"][value="marco"]');
    if (marco) marco.checked = true;
    if (audioMedName) audioMedName.value = '';
    if (audioMedTime) audioMedTime.value = '';
    syncAudioKindBlocks();
  }

  function openAudioSheet() {
    resetAudioModal();
    syncAudioKindBlocks();
    if (audioDayEl) audioDayEl.textContent = formatSelectedDayLabel();
    if (audioSheet) audioSheet.hidden = false;
    if (audioBackdrop) {
      audioBackdrop.hidden = false;
      audioBackdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function closeAudioSheet() {
    discardRecordingSession();
    revokeAudioPreview();
    recordedBlob = null;
    if (audioSheet) audioSheet.hidden = true;
    if (audioBackdrop) {
      audioBackdrop.hidden = true;
      audioBackdrop.setAttribute('aria-hidden', 'true');
    }
  }

  fab.addEventListener('click', () => {
    if (menu.hidden) openFabMenu();
    else closeFabMenu();
  });
  backdrop.addEventListener('click', closeFabMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (textSheet && !textSheet.hidden) {
      closeTextSheet();
      return;
    }
    if (audioSheet && !audioSheet.hidden) {
      closeAudioSheet();
      return;
    }
    if (menu && !menu.hidden) closeFabMenu();
  });

  if (textBackdrop) textBackdrop.addEventListener('click', closeTextSheet);
  if (textCancel) textCancel.addEventListener('click', closeTextSheet);
  document.querySelectorAll('input[name="diario-text-kind"]').forEach((el) => {
    el.addEventListener('change', () => {
      syncTextKindBlocks();
    });
  });

  document.querySelectorAll('input[name="diario-audio-kind"]').forEach((el) => {
    el.addEventListener('change', () => {
      syncAudioKindBlocks();
    });
  });

  if (textSave) {
    textSave.addEventListener('click', async () => {
      const kindInput = document.querySelector('input[name="diario-text-kind"]:checked');
      const kind =
        kindInput && kindInput.value === 'crise'
          ? 'crise'
          : kindInput && kindInput.value === 'medicacao'
            ? 'medicacao'
            : 'marco';
      const dateKey = selectedDateKey();

      if (kind === 'medicacao') {
        const name = (textMedName && textMedName.value.trim()) || '';
        const tRaw = textMedTime && textMedTime.value;
        const timePg = timeInputToPg(tRaw);
        if (!name) {
          showToast('Indique o medicamento.');
          if (textMedName) textMedName.focus();
          return;
        }
        if (!timePg) {
          showToast('Indique o horário em que foi dado.');
          if (textMedTime) textMedTime.focus();
          return;
        }
        const notes = (textMedNotes && textMedNotes.value.trim()) || '';
        const med = { name, timePg, timeDisplay: formatTimeForDisplay(timePg) };
        const cloud = await persistTextToCloud('medicacao', dateKey, notes, med);
        if (!cloud.ok) {
          try {
            saveTextLocalFallback('medicacao', dateKey, notes, med);
            showToast('Guardado neste dispositivo. Aplica a migração do diário (medicação) no Supabase para a nuvem.');
          } catch {
            showToast('Não foi possível guardar.');
            return;
          }
        } else {
          showToast('Medicação guardada na tua conta.');
        }
      } else {
        const body = (textField && textField.value.trim()) || '';
        if (!body) {
          showToast('Escreva uma descrição antes de salvar.');
          if (textField) textField.focus();
          return;
        }
        const cloud = await persistTextToCloud(kind, dateKey, body, null);
        if (!cloud.ok) {
          try {
            saveTextLocalFallback(kind, dateKey, body, null);
            showToast('Guardado neste dispositivo. Corre supabase/COLE_DIARIO_EVOLUCAO.sql para gravar na conta.');
          } catch {
            showToast('Não foi possível guardar.');
            return;
          }
        } else {
          showToast(kind === 'marco' ? 'Marco guardado na tua conta.' : 'Crise guardada na tua conta.');
        }
      }

      closeTextSheet();
      closeFabMenu();
      await refreshWeekEntriesFromDb();
      drawChart();
    });
  }

  if (audioToggle) {
    audioToggle.addEventListener('click', async () => {
      if (recordingActive) {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        const rec = mediaRecorder;
        rec.addEventListener(
          'stop',
          () => {
            const chunks = audioChunks.slice();
            const mimeType = rec.mimeType || 'audio/webm';
            if (audioStream) {
              audioStream.getTracks().forEach((t) => t.stop());
              audioStream = null;
            }
            recordedBlob = new Blob(chunks, { type: mimeType });
            mediaRecorder = null;
            audioChunks = [];
            recordingActive = false;
            revokeAudioPreview();
            previewObjectUrl = URL.createObjectURL(recordedBlob);
            if (audioPreview) audioPreview.src = previewObjectUrl;
            if (audioPreviewWrap) audioPreviewWrap.hidden = false;
            if (audioSave) audioSave.disabled = recordedBlob.size === 0;
            if (audioHint) {
              audioHint.textContent =
                recordedBlob.size > MAX_AUDIO_BYTES
                  ? 'Áudio grande: apague e grave de novo (máx. ~2 min).'
                  : 'Ouça o áudio e toque em Salvar no diário.';
            }
            if (audioToggle) {
              audioToggle.classList.remove('diario-audio-rec--stop');
              audioToggle.setAttribute('aria-pressed', 'false');
              audioToggle.setAttribute('aria-label', 'Gravar de novo');
            }
          },
          { once: true }
        );
        rec.stop();
        return;
      }

      revokeAudioPreview();
      recordedBlob = null;
      if (audioSave) audioSave.disabled = true;
      discardRecordingSession();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Seu navegador não permite gravar áudio aqui.');
        return;
      }

      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        showToast('Permissão do microfone negada ou indisponível.');
        return;
      }

      const mime = pickAudioMime();
      try {
        mediaRecorder = mime ? new MediaRecorder(audioStream, { mimeType: mime }) : new MediaRecorder(audioStream);
      } catch {
        showToast('Gravação de áudio não suportada neste aparelho.');
        audioStream.getTracks().forEach((t) => t.stop());
        audioStream = null;
        return;
      }

      audioChunks = [];
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) audioChunks.push(ev.data);
      };
      mediaRecorder.start(200);
      recordingActive = true;
      recordedBlob = null;
      revokeAudioPreview();
      if (audioSave) audioSave.disabled = true;
      audioToggle.classList.add('diario-audio-rec--stop');
      audioToggle.setAttribute('aria-pressed', 'true');
      audioToggle.setAttribute('aria-label', 'Parar gravação');
      if (audioHint) audioHint.textContent = 'Gravando… toque de novo para parar.';
    });
  }

  if (audioBackdrop) audioBackdrop.addEventListener('click', closeAudioSheet);
  if (audioCancel) audioCancel.addEventListener('click', closeAudioSheet);
  if (audioSave) {
    audioSave.addEventListener('click', async () => {
      if (!recordedBlob || recordedBlob.size === 0) {
        showToast('Grave um áudio antes de salvar.');
        return;
      }
      if (recordedBlob.size > MAX_AUDIO_BYTES) {
        showToast('Áudio muito longo. Grave outro trecho mais curto.');
        return;
      }
      const kindInput = document.querySelector('input[name="diario-audio-kind"]:checked');
      const kind =
        kindInput && kindInput.value === 'crise'
          ? 'crise'
          : kindInput && kindInput.value === 'medicacao'
            ? 'medicacao'
            : 'marco';
      const dateKey = selectedDateKey();

      let medOpt = null;
      if (kind === 'medicacao') {
        const n = (audioMedName && audioMedName.value.trim()) || '';
        const tr = audioMedTime && audioMedTime.value;
        const timePg = timeInputToPg(tr);
        medOpt = {
          name: n || null,
          timePg: timePg || null,
          timeDisplay: timePg ? formatTimeForDisplay(timePg) : '',
        };
      }

      const cloud = await persistAudioToCloud(kind, dateKey, recordedBlob, medOpt);
      if (!cloud.ok) {
        try {
          await saveAudioLocalFallback(kind, dateKey, recordedBlob, medOpt);
          showToast('Áudio guardado neste dispositivo. Configura o bucket no Supabase para a nuvem.');
        } catch {
          showToast('Não foi possível guardar o áudio.');
          return;
        }
      } else {
        showToast(kind === 'medicacao' ? 'Áudio de medicação guardado na tua conta.' : 'Áudio guardado na tua conta.');
      }

      closeAudioSheet();
      closeFabMenu();
      await refreshWeekEntriesFromDb();
      drawChart();
    });
  }

  optAudio.addEventListener('click', () => {
    closeFabMenu();
    openAudioSheet();
  });
  optTexto.addEventListener('click', () => {
    closeFabMenu();
    openTextSheet();
  });

  btnRel.addEventListener('click', async () => {
    // Abre imediatamente para não cair no bloqueio de popup após awaits.
    const w = window.open('', '_blank');
    if (!w) {
      showToast('Permite pop-ups para abrir o relatório.');
      return;
    }
    w.document.write(
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Gerando relatório…</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#2d2a26;">Gerando relatório…</body></html>'
    );
    w.document.close();

    const start = dateKeyLocal(weekStart);
    const end = dateKeyLocal(addDays(weekStart, 6));
    const rangeLabel = formatRange(weekStart, addDays(weekStart, 6));

    let cloudRows = [];
    if (supabase && userId) {
      const { data, error } = await supabase
        .from(DIARY_TABLE)
        .select('entry_date, kind, mode, text_content, created_at, medication_name, medication_given_at')
        .eq('user_id', userId)
        .gte('entry_date', start)
        .lte('entry_date', end)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        showToast('Não foi possível carregar os registos da nuvem.');
        w.document.open();
        w.document.write(
          '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Erro no relatório</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#2d2a26;">Não foi possível carregar os registos da nuvem.</body></html>'
        );
        w.document.close();
        return;
      }
      cloudRows = data || [];
    }

    const local = loadDiarioStore();
    const localRows = (local.entries || []).filter((e) => e.dateKey >= start && e.dateKey <= end);

    const rowsHtml = [];

    function tipoLabel(kind) {
      if (kind === 'marco') return 'Marco alcançado';
      if (kind === 'crise') return 'Crise';
      if (kind === 'medicacao') return 'Medicação';
      return escapeHtml(String(kind || '—'));
    }

    cloudRows.forEach((r) => {
      const dk = typeof r.entry_date === 'string' ? r.entry_date.slice(0, 10) : r.entry_date;
      const tipo = tipoLabel(r.kind);
      const forma = r.mode === 'audio' ? 'Áudio' : 'Texto';
      let conteudo = '—';
      if (r.kind === 'medicacao') {
        const bits = [];
        if (r.medication_name) bits.push(`Medicamento: ${escapeHtml(String(r.medication_name).trim())}`);
        if (r.medication_given_at != null && String(r.medication_given_at).trim() !== '') {
          bits.push(`Horário: ${escapeHtml(formatTimeForDisplay(r.medication_given_at))}`);
        }
        if (r.mode === 'audio') bits.push('Nota de voz (ficheiro na Aura)');
        else if (r.text_content && String(r.text_content).trim()) {
          bits.push(escapeHtml(String(r.text_content).replace(/\s+/g, ' ').trim()));
        }
        conteudo = bits.length ? bits.join(' · ') : '—';
      } else if (r.mode === 'audio') {
        conteudo = 'Nota de voz (ficheiro na Aura)';
      } else {
        conteudo = escapeHtml((r.text_content || '').replace(/\s+/g, ' ').trim());
      }
      const hora = r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '—';
      rowsHtml.push(
        `<tr><td>${escapeHtml(dk)}</td><td>${tipo}</td><td>${forma}</td><td>${conteudo}</td><td>${escapeHtml(hora)}</td></tr>`
      );
    });

    localRows.forEach((r) => {
      const tipo = tipoLabel(r.kind);
      const forma = r.mode === 'audio' ? 'Áudio' : 'Texto';
      let conteudo = '—';
      if (r.kind === 'medicacao') {
        const bits = [];
        if (r.medicationName) bits.push(`Medicamento: ${escapeHtml(String(r.medicationName).trim())}`);
        if (r.medicationGivenAt) bits.push(`Horário: ${escapeHtml(String(r.medicationGivenAt))}`);
        if (r.mode === 'audio') bits.push('Nota de voz (só neste dispositivo)');
        else if (r.text && String(r.text).trim()) bits.push(escapeHtml(String(r.text).replace(/\s+/g, ' ').trim()));
        conteudo = bits.length ? bits.join(' · ') : '—';
      } else if (r.mode === 'text' && r.text) conteudo = escapeHtml(r.text.replace(/\s+/g, ' ').trim());
      else if (r.mode === 'audio') conteudo = 'Nota de voz (só neste dispositivo)';
      const hora = r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : '—';
      rowsHtml.push(
        `<tr><td>${escapeHtml(r.dateKey)}</td><td>${tipo}</td><td>${forma} (local)</td><td>${conteudo}</td><td>${escapeHtml(hora)}</td></tr>`
      );
    });

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório — Diário clínico</title>
<style>
body{font-family:system-ui,sans-serif;padding:24px;color:#2d2a26;max-width:800px;margin:0 auto;}
h1{font-size:1.25rem;margin:0 0 8px;}
h2{font-size:1.05rem;margin:28px 0 8px;}
p.meta{color:#5a5550;font-size:.9rem;margin:0 0 20px;}
table{width:100%;border-collapse:collapse;font-size:.85rem;}
th,td{border:1px solid #ede4d4;padding:8px;text-align:left;vertical-align:top;}
th{background:#e8f2e9;}
@media print{body{padding:12px;}}
</style></head><body>
<h1>Diário de evolução clínica</h1>
<p class="meta">Semana: ${escapeHtml(rangeLabel)} · Aura</p>
<h2>Marcos, crises, medicação e notas</h2>
<table>
<thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th>Conteúdo / nota</th><th>Registado</th></tr></thead>
<tbody>${rowsHtml.length ? rowsHtml.join('') : '<tr><td colspan="5">Nenhum registo nesta semana.</td></tr>'}</tbody>
</table>
<p style="margin-top:20px;font-size:.8rem;color:#a09a92;">Documento gerado para partilha com profissionais de saúde. Confirme os dados antes de enviar.</p>
</body></html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    requestAnimationFrame(() => {
      try {
        w.print();
      } catch {
        /* ignore */
      }
    });
    showToast('Relatório aberto — use «Guardar como PDF» na impressão se quiser.');
  });

  await renderWeek();
}

main().catch((e) => console.warn('[Aura] diario-evolucao:', e));
