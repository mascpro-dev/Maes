/**
 * agenda.html — calendário (dia / semana / mês), lista, localStorage + sync opcional do próximo para profiles.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function getClient() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return null;
  }
  if (window.__auraSupabaseClient) return window.__auraSupabaseClient;
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function syncMapsButton(locText) {
  const btn = document.getElementById('btn-agenda-maps');
  if (!btn) return;
  const q = (locText || '').trim();
  if (q) btn.setAttribute('data-maps-query', q);
  else btn.removeAttribute('data-maps-query');
}

function applyHeroFromNext(next, childName) {
  const titleEl = document.getElementById('agenda-hero-title');
  const timeEl = document.getElementById('agenda-hero-time');
  const locEl = document.getElementById('agenda-hero-location');

  if (!next?.startAt) {
    if (titleEl) titleEl.textContent = childName ? `Próxima terapia de ${childName}` : 'Sem compromissos marcados';
    if (timeEl) timeEl.textContent = 'Adiciona um compromisso abaixo';
    if (locEl) locEl.textContent = '—';
    window.AuraDashboard?.setAppointmentTarget?.(null, {
      countdownText: '—',
      countdownId: 'agenda-countdown',
      countdownLabelId: 'agenda-countdown-label',
    });
    syncMapsButton('');
    return;
  }

  const d = next.startAt;
  if (titleEl) titleEl.textContent = next.title || 'Próximo compromisso';
  if (timeEl) {
    timeEl.textContent = d.toLocaleString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (locEl) locEl.textContent = (next.location || '').trim() || 'Local a definir';
  window.AuraDashboard?.setAppointmentTarget?.(d.toISOString(), {
    countdownId: 'agenda-countdown',
    countdownLabelId: 'agenda-countdown-label',
  });
  syncMapsButton(next.location);
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

async function pushNextToProfile(supabase, uid) {
  if (!supabase || !uid) return { ok: false };
  const next = window.AuraAppointments.getNextOccurrence();
  const { error } = await supabase
    .from('profiles')
    .update({
      next_appointment_at: next?.startAt ? next.startAt.toISOString() : null,
      next_appointment_title: next?.title || null,
      next_appointment_location: next?.location ? String(next.location).trim() || null : null,
    })
    .eq('id', uid);
  if (error) {
    console.warn('[Aura] agenda sync profile:', error.message);
    return { ok: false, error };
  }
  return { ok: true };
}

function renderCalendarMonth(mount, year, month, selectedDay, onPickDay) {
  mount.innerHTML = '';
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const grid = document.createElement('div');
  grid.className = 'agenda-month-grid';
  const wk = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  wk.forEach((label) => {
    const h = document.createElement('div');
    h.className = 'agenda-month-dow';
    h.textContent = label;
    grid.appendChild(h);
  });

  const rangeStart = startOfDay(first);
  const rangeEnd = endOfDay(new Date(year, month, daysInMonth));
  const occ = window.AuraAppointments.occurrencesInRange(rangeStart, rangeEnd);
  const countsByDay = {};
  occ.forEach((o) => {
    const k = `${o.startAt.getFullYear()}-${o.startAt.getMonth()}-${o.startAt.getDate()}`;
    countsByDay[k] = (countsByDay[k] || 0) + 1;
  });

  for (let i = 0; i < startWeekday; i++) {
    const c = document.createElement('div');
    c.className = 'agenda-month-cell agenda-month-cell--empty';
    grid.appendChild(c);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'agenda-month-day';
    const dt = new Date(year, month, day);
    const isSel =
      selectedDay &&
      dt.getFullYear() === selectedDay.getFullYear() &&
      dt.getMonth() === selectedDay.getMonth() &&
      dt.getDate() === selectedDay.getDate();
    if (isSel) cell.classList.add('agenda-month-day--selected');
    cell.textContent = String(day);
    const k = `${year}-${month}-${day}`;
    if (countsByDay[k]) {
      const dot = document.createElement('span');
      dot.className = 'agenda-month-dot';
      cell.appendChild(dot);
    }
    cell.addEventListener('click', () => onPickDay(new Date(year, month, day)));
    grid.appendChild(cell);
  }

  mount.appendChild(grid);
}

function renderEventList(listEl, rows, onDelete) {
  listEl.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'agenda-list-empty';
    li.textContent = 'Nenhum compromisso neste período.';
    listEl.appendChild(li);
    return;
  }
  rows.forEach((row) => {
    const li = document.createElement('li');
    li.className = 'agenda-list-item';
    const main = document.createElement('div');
    main.className = 'agenda-list-item__main';
    const t = document.createElement('strong');
    t.textContent = row.title;
    const sub = document.createElement('span');
    sub.className = 'agenda-list-item__time';
    sub.textContent = row.startAt.toLocaleString('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (row.location) {
      const loc = document.createElement('span');
      loc.className = 'agenda-list-item__loc';
      loc.textContent = row.location;
      main.appendChild(t);
      main.appendChild(sub);
      main.appendChild(loc);
    } else {
      main.appendChild(t);
      main.appendChild(sub);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'agenda-list-item__del';
    del.setAttribute('aria-label', 'Remover compromisso');
    del.textContent = '✕';
    del.addEventListener('click', () => onDelete(row.eventId));
    li.appendChild(main);
    li.appendChild(del);
    listEl.appendChild(li);
  });
}

async function main() {
  const supabase = await getClient();
  if (!supabase) {
    const statusEl = document.getElementById('agenda-save-status');
    if (statusEl) statusEl.textContent = 'Sem ligação à conta — compromissos ficam só neste dispositivo.';
  }

  let uid = null;
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      window.location.replace('login.html');
      return;
    }
    uid = session.user.id;

    const [{ data: profile }, { data: children }] = await Promise.all([
      supabase.from('profiles').select('nome_crianca').eq('id', uid).maybeSingle(),
      supabase.from('children').select('nome, created_at').eq('user_id', uid).order('created_at', { ascending: true }),
    ]);

    const childName =
      (children?.[0]?.nome && String(children[0].nome).trim()) ||
      (profile?.nome_crianca && String(profile.nome_crianca).trim()) ||
      '';

    window.__agendaChildName = childName;
  }

  const state = {
    view: 'day',
    cursor: new Date(),
    selectedDay: startOfDay(new Date()),
  };

  const mount = document.getElementById('agenda-calendar-mount');
  const listEl = document.getElementById('agenda-event-list');
  const navRow = document.getElementById('agenda-nav-row');
  const navLabel = document.getElementById('agenda-nav-label');

  function rangeForView() {
    if (state.view === 'day') {
      const s = startOfDay(state.selectedDay);
      return { start: s, end: endOfDay(s) };
    }
    if (state.view === 'week') {
      const d = new Date(state.cursor);
      const wd = (d.getDay() + 6) % 7;
      const monday = addDays(startOfDay(d), -wd);
      return { start: monday, end: endOfDay(addDays(monday, 6)) };
    }
    const y = state.cursor.getFullYear();
    const m = state.cursor.getMonth();
    return { start: startOfDay(new Date(y, m, 1)), end: endOfDay(new Date(y, m + 1, 0)) };
  }

  function refresh() {
    const next = window.AuraAppointments.getNextOccurrence();
    applyHeroFromNext(next, window.__agendaChildName || '');

    document.querySelectorAll('.agenda-tab').forEach((tab) => {
      const on = tab.dataset.view === state.view;
      tab.classList.toggle('agenda-tab--active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (state.view === 'month') {
      navRow.hidden = false;
      const y = state.cursor.getFullYear();
      const m = state.cursor.getMonth();
      if (navLabel) navLabel.textContent = `${MONTH_NAMES[m]} ${y}`;
      mount.innerHTML = '';
      renderCalendarMonth(mount, y, m, state.selectedDay, (picked) => {
        state.selectedDay = startOfDay(picked);
        state.cursor = new Date(picked);
        state.view = 'day';
        refresh();
      });
    } else {
      mount.innerHTML = '';
      navRow.hidden = false;
      const { start, end } = rangeForView();
      if (state.view === 'day' && navLabel) {
        navLabel.textContent = start.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } else if (state.view === 'week' && navLabel) {
        navLabel.textContent = `${start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }
    }

    const { start, end } = rangeForView();
    const rows = window.AuraAppointments.occurrencesInRange(start, end);
    renderEventList(listEl, rows, (eventId) => {
      window.AuraAppointments.remove(eventId);
      refresh();
      pushNextToProfile(supabase, uid).then(() => {});
    });
  }

  document.querySelectorAll('.agenda-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view || 'day';
      if (state.view === 'month' || state.view === 'week') {
        state.cursor = new Date(state.selectedDay);
      }
      refresh();
    });
  });

  document.getElementById('agenda-prev')?.addEventListener('click', () => {
    if (state.view === 'day') state.selectedDay = addDays(state.selectedDay, -1);
    else if (state.view === 'week') state.cursor = addDays(state.cursor, -7);
    else state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
    refresh();
  });

  document.getElementById('agenda-next')?.addEventListener('click', () => {
    if (state.view === 'day') state.selectedDay = addDays(state.selectedDay, 1);
    else if (state.view === 'week') state.cursor = addDays(state.cursor, 7);
    else state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
    refresh();
  });

  document.getElementById('btn-agenda-add')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('agenda-save-status');
    const dtEl = document.getElementById('agenda-appt-datetime');
    const titleEl = document.getElementById('agenda-appt-title');
    const locEl = document.getElementById('agenda-appt-location');
    const recEl = document.getElementById('agenda-recurrence');
    const atVal = dtEl?.value?.trim();
    if (!atVal) {
      if (statusEl) statusEl.textContent = 'Indica data e hora.';
      return;
    }
    const startISO = new Date(atVal).toISOString();
    window.AuraAppointments.add({
      title: (titleEl?.value || '').trim() || 'Compromisso',
      location: (locEl?.value || '').trim(),
      startISO,
      recurrence: recEl?.value || 'none',
    });
    if (statusEl) statusEl.textContent = 'Compromisso adicionado.';
    const sync = await pushNextToProfile(supabase, uid);
    if (!sync.ok && supabase && statusEl) {
      statusEl.textContent += ' (nuvem: não atualizado — verifica colunas no perfil.)';
    }
    refresh();
    if (typeof showToast === 'function') showToast('Compromisso guardado ✓');
  });

  document.getElementById('btn-agenda-sync-profile')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('agenda-save-status');
    const r = await pushNextToProfile(supabase, uid);
    if (statusEl) statusEl.textContent = r.ok ? 'Perfil na nuvem atualizado com o próximo compromisso.' : 'Não foi possível sincronizar.';
  });

  const dtEl = document.getElementById('agenda-appt-datetime');
  if (dtEl && !dtEl.value) dtEl.value = toDatetimeLocalValue(new Date().toISOString());

  refresh();
}

main().catch((e) => console.warn('[Aura] agenda:', e));
