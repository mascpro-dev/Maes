/* ============================================================
   Aura — Diário de Evolução Clínica
   ============================================================ */

'use strict';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Dados de exemplo: uma série por semana (índice 0 = semana atual) */
const SAMPLE_WEEKS = [
  { marcos: [4, 5, 3, 6, 5, 7, 5], crises: [2, 1, 3, 2, 1, 2, 1] },
  { marcos: [3, 4, 5, 4, 6, 5, 6], crises: [3, 2, 2, 1, 2, 1, 0] },
  { marcos: [5, 5, 6, 7, 6, 8, 7], crises: [1, 2, 1, 1, 2, 1, 1] },
];

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
  }, 2800);
}

(function initDiario() {
  const strip = document.getElementById('diario-week-strip');
  const labelEl = document.getElementById('diario-week-label');
  const btnPrev = document.getElementById('diario-week-prev');
  const btnNext = document.getElementById('diario-week-next');
  const lineMarcos = document.getElementById('diario-line-marcos');
  const lineCrises = document.getElementById('diario-line-crises');
  const areaMarcos = document.getElementById('diario-area-marcos');
  const areaCrises = document.getElementById('diario-area-crises');
  const dotsMarcos = document.getElementById('diario-dots-marcos');
  const dotsCrises = document.getElementById('diario-dots-crises');
  const yLabels = document.getElementById('diario-y-labels');
  const xLabels = document.getElementById('diario-x-labels');

  const fab = document.getElementById('diario-fab');
  const menu = document.getElementById('diario-fab-menu');
  const backdrop = document.getElementById('diario-fab-backdrop');
  const optAudio = document.getElementById('diario-opt-audio');
  const optTexto = document.getElementById('diario-opt-texto');
  const btnRel = document.getElementById('diario-btn-relatorio');

  if (!strip || !labelEl) return;

  const today = new Date();
  let weekStart = startOfWeekMonday(today);
  /** Offset em semanas relativas à semana que contém "hoje" */
  let weekOffset = 0;
  let selectedIndex = (() => {
    const s = startOfWeekMonday(today);
    let i = 0;
    for (; i < 7; i++) {
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

  function weekDataIndex() {
    const o = ((weekOffset % SAMPLE_WEEKS.length) + SAMPLE_WEEKS.length) % SAMPLE_WEEKS.length;
    return o;
  }

  function drawChart() {
    const data = SAMPLE_WEEKS[weekDataIndex()];
    const x0 = 36;
    const x1 = 304;
    const yTop = 28;
    const yBottom = 138;
    const vmin = 0;
    const peak = Math.max(1, ...data.marcos, ...data.crises);
    const vmax = niceCeilMax(peak);

    const pm = pointsFromValues(data.marcos, x0, x1, yBottom, yTop, vmin, vmax);
    const pc = pointsFromValues(data.crises, x0, x1, yBottom, yTop, vmin, vmax);

    const dM = smoothPathThrough(pm);
    const dC = smoothPathThrough(pc);
    lineMarcos.setAttribute('d', dM);
    lineCrises.setAttribute('d', dC);
    areaMarcos.setAttribute('d', areaUnderLine(dM, yBottom));
    areaCrises.setAttribute('d', areaUnderLine(dC, yBottom));
    renderDots(dotsMarcos, pm, 3.5);
    renderDots(dotsCrises, pc, 3.5);
    renderYAxisLabels(yLabels, vmax);
    renderXAxisLabels(xLabels, pm, WEEKDAYS);
  }

  function renderWeek() {
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
      btn.addEventListener('click', () => {
        selectedIndex = i;
        renderWeek();
      });
      strip.appendChild(btn);
    }
    drawChart();
  }

  btnPrev.addEventListener('click', () => {
    weekStart = addDays(weekStart, -7);
    weekOffset -= 1;
    renderWeek();
  });
  btnNext.addEventListener('click', () => {
    weekStart = addDays(weekStart, 7);
    weekOffset += 1;
    renderWeek();
  });

  function closeFabMenu() {
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

  fab.addEventListener('click', () => {
    if (menu.hidden) openFabMenu();
    else closeFabMenu();
  });
  backdrop.addEventListener('click', closeFabMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeFabMenu();
  });

  optAudio.addEventListener('click', () => {
    closeFabMenu();
    showToast('Gravação por áudio: em breve você poderá anexar notas de voz ao diário.');
  });
  optTexto.addEventListener('click', () => {
    closeFabMenu();
    showToast('Registro em texto: abra o editor para descrever o dia com calma.');
  });
  btnRel.addEventListener('click', () => {
    showToast('Gerando PDF do período selecionado para levar ao médico…');
  });

  renderWeek();
})();
