/**
 * especialista-agenda.html — médico credenciado fecha/reabre slots (30 ou 60 min conforme o especialista).
 * Requer migração 20260410210000 + ligação em admin (admin_link_specialist_account).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDayRangeISO(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const nextMidnight = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { from: start.toISOString(), toExclusive: nextMidnight.toISOString() };
}

function combineLocalDateAndSlot(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

/** Grelha 30 em 30 (08–17:30) ou só horas cheias 08–16 para consultas de 60 min. */
function generateDaySlots(dateStr, slotMinutes = 30) {
  const slots = [];
  if (Number(slotMinutes) === 60) {
    for (let h = 8; h <= 16; h++) {
      slots.push({ hour: h, minute: 0, dt: combineLocalDateAndSlot(dateStr, h, 0) });
    }
    return slots;
  }
  for (let h = 8; h <= 17; h++) {
    for (const mm of [0, 30]) {
      if (h === 17 && mm === 30) break;
      slots.push({ hour: h, minute: mm, dt: combineLocalDateAndSlot(dateStr, h, mm) });
    }
  }
  return slots;
}

function bookingOverlapsSlot(bookingStartMs, bookingDurMin, slotStartMs, slotDurMin) {
  const bd = Number(bookingDurMin) || 30;
  const sd = Number(slotDurMin) || 30;
  const bEnd = bookingStartMs + bd * 60 * 1000;
  const sEnd = slotStartMs + sd * 60 * 1000;
  return bookingStartMs < sEnd && bEnd > slotStartMs;
}

function slotBlockedByAnyBooking(rows, slotStartMs, slotDurMin) {
  for (const r of rows) {
    if (!r?.starts_at) continue;
    const st = new Date(r.starts_at).getTime();
    const dm = Number(r.duration_minutes) || 30;
    if (bookingOverlapsSlot(st, dm, slotStartMs, slotDurMin)) return true;
  }
  return false;
}

function formatSlotLabel(dt) {
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Notifica equipa (Resend) — falha em silêncio se a função não estiver deployada ou sem secrets. */
async function notifyCalendarSlotChange(sb, { action, startsAtIso, specialistId, specialistName }) {
  try {
    const { error } = await sb.functions.invoke('notify-calendar-slot-change', {
      body: {
        action,
        starts_at: startsAtIso,
        specialist_id: specialistId,
        specialist_display_name: specialistName || '',
      },
    });
    if (error) console.warn('[esp-agenda] notify:', error.message || error);
  } catch (e) {
    console.warn('[esp-agenda] notify:', e?.message || e);
  }
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

async function main() {
  const denied = document.getElementById('esp-agenda-denied');
  const app = document.getElementById('esp-agenda-app');
  const specLine = document.getElementById('esp-agenda-spec-line');
  const dateInput = document.getElementById('esp-agenda-date');
  const slotsEl = document.getElementById('esp-agenda-slots');
  const statusEl = document.getElementById('esp-agenda-status');

  const sb = await getClient();
  if (!sb) {
    if (denied) {
      denied.hidden = false;
      denied.textContent = 'Sessão inválida. Entra de novo.';
    }
    return;
  }

  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session?.user?.id) {
    if (denied) {
      denied.hidden = false;
      denied.textContent = 'Sessão inválida. Entra de novo.';
    }
    return;
  }

  const { data: profRow, error: profErr } = await sb
    .from('profiles')
    .select('account_type')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profErr && profRow?.account_type === 'mother') {
    if (denied) {
      denied.hidden = false;
      denied.innerHTML =
        'Esta conta está definida como <strong>Mãe</strong>. Só contas <strong>Médico</strong> (marcadas no painel admin) podem usar esta agenda.';
    }
    return;
  }

  const { data: specialistId, error: sidErr } = await sb.rpc('my_specialist_id');
  if (sidErr || !specialistId) {
    if (denied) {
      denied.hidden = false;
      denied.innerHTML =
        'Esta conta não está ligada a um especialista. Pede a uma administradora que faça a ligação no painel admin (UUID do teu utilizador + escolha do médico).';
    }
    return;
  }

  const { data: specRow, error: specErr } = await sb
    .from('specialists')
    .select('display_name, specialty, consultation_duration_minutes')
    .eq('id', specialistId)
    .maybeSingle();

  if (specErr || !specRow) {
    if (denied) {
      denied.hidden = false;
      denied.textContent =
        (specErr && specErr.message) ||
        'Não foi possível carregar o perfil do especialista. Confirma a migração e a ligação da conta.';
    }
    return;
  }

  denied.hidden = true;
  app.hidden = false;
  const consultSlotMin = Number(specRow.consultation_duration_minutes) === 60 ? 60 : 30;

  if (specLine) {
    specLine.textContent = `${specRow.display_name || 'Especialista'} · ${specRow.specialty || ''} · marcação ${consultSlotMin} min`;
  }

  const today = new Date();
  dateInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  dateInput.min = dateInput.value;

  async function loadDaySets(dateStr) {
    const { from, toExclusive } = localDayRangeISO(dateStr);
    const [bookRes, blockRes] = await Promise.all([
      sb
        .from('consultation_bookings')
        .select('starts_at,status,duration_minutes')
        .eq('specialist_id', specialistId)
        .in('status', ['pending_payment', 'confirmed'])
        .gte('starts_at', from)
        .lt('starts_at', toExclusive),
      sb
        .from('specialist_calendar_blocks')
        .select('starts_at')
        .eq('specialist_id', specialistId)
        .gte('starts_at', from)
        .lt('starts_at', toExclusive),
    ]);

    if (bookRes.error) throw bookRes.error;
    if (blockRes.error) throw blockRes.error;

    const bookingRows = bookRes.data || [];
    const blocked = new Set();
    (blockRes.data || []).forEach((r) => {
      if (r.starts_at) blocked.add(new Date(r.starts_at).getTime());
    });
    return { bookingRows, blocked };
  }

  async function renderDay() {
    const dateStr = dateInput.value;
    if (!dateStr || !slotsEl) return;
    statusEl.textContent = '';
    slotsEl.innerHTML = '';
    let bookingRows;
    let blocked;
    try {
      const sets = await loadDaySets(dateStr);
      bookingRows = sets.bookingRows;
      blocked = sets.blocked;
    } catch (e) {
      statusEl.textContent = e.message || String(e);
      return;
    }

    const slots = generateDaySlots(dateStr, consultSlotMin);
    const now = Date.now();

    slots.forEach((slot) => {
      const t = slot.dt.getTime();
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'spec-slot';
      b.textContent = formatSlotLabel(slot.dt);

      if (t <= now + 10 * 60 * 1000) {
        b.disabled = true;
        b.classList.add('esp-slot--booked');
        b.title = 'Horário já passou';
        slotsEl.appendChild(b);
        return;
      }

      if (slotBlockedByAnyBooking(bookingRows, t, consultSlotMin)) {
        b.disabled = true;
        b.classList.add('esp-slot--booked');
        b.title = 'Reserva confirmada ou em pagamento — não podes alterar aqui';
        slotsEl.appendChild(b);
        return;
      }

      const tHalf = t + 30 * 60 * 1000;
      const doctorClosedThisSlot =
        consultSlotMin === 60 ? blocked.has(t) || blocked.has(tHalf) : blocked.has(t);

      if (doctorClosedThisSlot) {
        b.classList.add('esp-slot--blocked');
        b.title =
          consultSlotMin === 60
            ? 'Hora fechada por ti — toca para reabrir os dois intervalos de 30 min'
            : 'Fechado por ti — toca para reabrir';
        b.addEventListener('click', async () => {
          statusEl.textContent = 'A atualizar…';
          b.disabled = true;
          const iso0 = slot.dt.toISOString();
          const iso1 = new Date(tHalf).toISOString();
          let q = sb.from('specialist_calendar_blocks').delete().eq('specialist_id', specialistId);
          if (consultSlotMin === 60) {
            q = q.in('starts_at', [iso0, iso1]);
          } else {
            q = q.eq('starts_at', iso0);
          }
          const { error } = await q;
          b.disabled = false;
          if (error) {
            statusEl.textContent = error.message || String(error);
            return;
          }
          statusEl.textContent = 'Horário reaberto ao público.';
          await notifyCalendarSlotChange(sb, {
            action: 'unblock',
            startsAtIso: iso0,
            specialistId,
            specialistName: specRow.display_name,
          });
          await renderDay();
        });
        slotsEl.appendChild(b);
        return;
      }

      b.title =
        consultSlotMin === 60
          ? 'Disponível — toca para fechar esta hora ao público (2 × 30 min)'
          : 'Disponível — toca para fechar ao público';
      b.addEventListener('click', async () => {
        statusEl.textContent = 'A atualizar…';
        b.disabled = true;
        const iso0 = slot.dt.toISOString();
        const rows =
          consultSlotMin === 60
            ? [
                { specialist_id: specialistId, starts_at: iso0 },
                { specialist_id: specialistId, starts_at: new Date(tHalf).toISOString() },
              ]
            : [{ specialist_id: specialistId, starts_at: iso0 }];
        const { error } = await sb.from('specialist_calendar_blocks').insert(rows);
        b.disabled = false;
        if (error) {
          statusEl.textContent = error.message || String(error);
          return;
        }
        statusEl.textContent = 'Horário fechado ao público.';
        await notifyCalendarSlotChange(sb, {
          action: 'block',
          startsAtIso: iso0,
          specialistId,
          specialistName: specRow.display_name,
        });
        await renderDay();
      });
      slotsEl.appendChild(b);
    });
  }

  dateInput.addEventListener('change', () => {
    renderDay();
  });

  await renderDay();
}

main();
