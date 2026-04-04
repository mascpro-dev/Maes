/**
 * agenda.html — calendário (dia / semana / mês), lista estilo “slots”, localStorage + sync opcional do próximo para profiles.
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

function syncDatetimeInputToSelectedDay(dtEl, selectedDay) {
  if (!dtEl || !selectedDay) return;
  const cur = dtEl.value ? new Date(dtEl.value) : null;
  const ok = cur && !Number.isNaN(cur.getTime());
  const h = ok ? cur.getHours() : 9;
  const m = ok ? cur.getMinutes() : 0;
  const d = selectedDay;
  dtEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`;
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
    cell.appendChild(document.createTextNode(String(day)));
    const k = `${year}-${month}-${day}`;
    const cnt = countsByDay[k] || 0;
    if (cnt > 0) {
      const wrap = document.createElement('span');
      wrap.className = 'agenda-month-dots';
      const n = Math.min(cnt, 3);
      for (let di = 0; di < n; di++) {
        const dot = document.createElement('span');
        dot.className = 'agenda-month-dot';
        wrap.appendChild(dot);
      }
      cell.appendChild(wrap);
    }
    cell.addEventListener('click', () => onPickDay(new Date(year, month, day)));
    grid.appendChild(cell);
  }

  mount.appendChild(grid);
}

function kindLabel(kind) {
  if (kind === 'medicine') return 'Remédio';
  if (kind === 'doctor') return 'Médico';
  return 'Outro';
}

function renderEventList(listEl, rows, onDelete) {
  listEl.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'agenda-list-empty';
    li.textContent = 'Nada marcado neste período.';
    listEl.appendChild(li);
    return;
  }
  rows.forEach((row) => {
    const li = document.createElement('li');
    li.className = 'agenda-list-item agenda-list-item--slot';

    const timeCol = document.createElement('div');
    timeCol.className = 'agenda-slot-timecol';
    const timeTop = document.createElement('span');
    timeTop.className = 'agenda-slot-time';
    timeTop.textContent = row.startAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const timeSub = document.createElement('span');
    timeSub.className = 'agenda-slot-day';
    timeSub.textContent = row.startAt.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' });
    timeCol.appendChild(timeTop);
    timeCol.appendChild(timeSub);

    const card = document.createElement('div');
    card.className = 'agenda-slot-card';

    const head = document.createElement('div');
    head.className = 'agenda-slot-card__head';
    const badge = document.createElement('span');
    badge.className = `agenda-slot-kind agenda-slot-kind--${row.kind || 'other'}`;
    badge.textContent = kindLabel(row.kind);
    head.appendChild(badge);
    if (row.remind15) {
      const bell = document.createElement('span');
      bell.className = 'agenda-slot-bell';
      bell.setAttribute('title', 'Lembrete 15 min antes');
      bell.textContent = '🔔';
      head.appendChild(bell);
    }
    card.appendChild(head);

    const title = document.createElement('strong');
    title.className = 'agenda-slot-title';
    title.textContent = row.title || 'Compromisso';
    card.appendChild(title);

    if (row.location) {
      const loc = document.createElement('span');
      loc.className = 'agenda-slot-loc';
      loc.textContent = row.location;
      card.appendChild(loc);
    }

    const actions = document.createElement('div');
    actions.className = 'agenda-slot-actions';
    if (row.location && String(row.location).trim()) {
      const mapBtn = document.createElement('button');
      mapBtn.type = 'button';
      mapBtn.className = 'agenda-slot-maps';
      mapBtn.setAttribute('data-aura-maps', '');
      mapBtn.setAttribute('data-maps-query', String(row.location).trim());
      mapBtn.setAttribute('aria-label', 'Abrir local no mapa');
      mapBtn.textContent = 'Mapa';
      actions.appendChild(mapBtn);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'agenda-list-item__del';
    del.setAttribute('aria-label', 'Remover compromisso');
    del.textContent = '✕';
    del.addEventListener('click', () => onDelete(row.eventId));
    actions.appendChild(del);

    card.appendChild(actions);
    li.appendChild(timeCol);
    li.appendChild(card);
    listEl.appendChild(li);
  });
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

function openMapsFromBtn(btn) {
  const q = btn.getAttribute('data-maps-query');
  if (q && String(q).trim()) {
    const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(String(q).trim());
    window.open(url, '_blank', 'noopener,noreferrer');
    if (typeof showToast === 'function') showToast('A abrir o mapa…');
  } else if (typeof showToast === 'function') {
    showToast('Sem local para abrir no mapa.');
  }
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
  }

  const state = {
    view: 'month',
    cursor: new Date(),
    selectedDay: startOfDay(new Date()),
  };

  const mount = document.getElementById('agenda-calendar-mount');
  const listEl = document.getElementById('agenda-event-list');
  const navRow = document.getElementById('agenda-nav-row');
  const navLabel = document.getElementById('agenda-nav-label');
  const listHeading = document.getElementById('agenda-list-heading');

  listEl.addEventListener('click', (e) => {
    const mapBtn = e.target.closest('[data-aura-maps]');
    if (mapBtn) {
      e.preventDefault();
      openMapsFromBtn(mapBtn);
    }
  });

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
    document.querySelectorAll('.agenda-tab').forEach((tab) => {
      const on = tab.dataset.view === state.view;
      tab.classList.toggle('agenda-tab--active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (state.view === 'month') {
      navRow.hidden = false;
      const y = state.cursor.getFullYear();
      const m = state.cursor.getMonth();
      if (navLabel) {
        navLabel.textContent = `${MONTH_NAMES[m]} ${y}`;
        navLabel.classList.add('agenda-nav-label--banner');
      }
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
      if (navLabel) navLabel.classList.remove('agenda-nav-label--banner');
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

    if (listHeading) {
      if (state.view === 'day') listHeading.textContent = 'Horários deste dia';
      else if (state.view === 'week') listHeading.textContent = 'Horários desta semana';
      else listHeading.textContent = 'Horários deste mês';
    }

    const { start, end } = rangeForView();
    const rows = window.AuraAppointments.occurrencesInRange(start, end);
    renderEventList(listEl, rows, (eventId) => {
      window.AuraAppointments.remove(eventId);
      window.AuraAppointmentReminders?.refresh?.();
      refresh();
      pushNextToProfile(supabase, uid).then(() => {});
    });

    const dtEl = document.getElementById('agenda-appt-datetime');
    syncDatetimeInputToSelectedDay(dtEl, state.selectedDay);
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

  document.getElementById('agenda-appt-kind')?.addEventListener('change', (e) => {
    const v = e.target?.value;
    const cb = document.getElementById('agenda-remind15');
    if (cb && (v === 'doctor' || v === 'medicine')) cb.checked = true;
  });

  document.getElementById('btn-agenda-notifications')?.addEventListener('click', () => {
    const statusEl = document.getElementById('agenda-save-status');
    window.AuraAppointmentReminders?.requestPermission?.((ok) => {
      if (statusEl) {
        statusEl.textContent = ok
          ? 'Notificações ativas. Avisamos cerca de 15 min antes dos itens com lembrete.'
          : 'Sem permissão — ativa as notificações nas definições do browser se quiseres lembretes.';
      }
      if (ok && typeof showToast === 'function') showToast('Notificações ativas ✓');
    });
  });

  document.getElementById('btn-agenda-add')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('agenda-save-status');
    const dtEl = document.getElementById('agenda-appt-datetime');
    const titleEl = document.getElementById('agenda-appt-title');
    const locEl = document.getElementById('agenda-appt-location');
    const recEl = document.getElementById('agenda-recurrence');
    const kindEl = document.getElementById('agenda-appt-kind');
    const remindEl = document.getElementById('agenda-remind15');
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
      kind: kindEl?.value || 'other',
      remind15: !!remindEl?.checked,
    });
    if (statusEl) statusEl.textContent = 'Guardado.';
    const sync = await pushNextToProfile(supabase, uid);
    if (!sync.ok && supabase && statusEl) {
      statusEl.textContent += ' (nuvem: não atualizado.)';
    }
    window.AuraAppointmentReminders?.refresh?.();
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
