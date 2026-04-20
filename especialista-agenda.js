/**
 * especialista-agenda.html — médico credenciado fecha/reabre slots (30 min).
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

function generateDaySlots(dateStr) {
  const slots = [];
  for (let h = 8; h <= 17; h++) {
    for (const mm of [0, 30]) {
      if (h === 17 && mm === 30) break;
      const dt = combineLocalDateAndSlot(dateStr, h, mm);
      slots.push({ hour: h, minute: mm, dt });
    }
  }
  return slots;
}

function formatSlotLabel(dt) {
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    .select('display_name, specialty')
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
  if (specLine) {
    specLine.textContent = `${specRow.display_name || 'Especialista'} · ${specRow.specialty || ''}`;
  }

  const today = new Date();
  dateInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  dateInput.min = dateInput.value;

  async function loadDaySets(dateStr) {
    const { from, toExclusive } = localDayRangeISO(dateStr);
    const [bookRes, blockRes] = await Promise.all([
      sb
        .from('consultation_bookings')
        .select('starts_at,status')
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

    const booked = new Set();
    (bookRes.data || []).forEach((r) => {
      if (r.starts_at) booked.add(new Date(r.starts_at).getTime());
    });
    const blocked = new Set();
    (blockRes.data || []).forEach((r) => {
      if (r.starts_at) blocked.add(new Date(r.starts_at).getTime());
    });
    return { booked, blocked };
  }

  async function renderDay() {
    const dateStr = dateInput.value;
    if (!dateStr || !slotsEl) return;
    statusEl.textContent = '';
    slotsEl.innerHTML = '';
    let booked;
    let blocked;
    try {
      const sets = await loadDaySets(dateStr);
      booked = sets.booked;
      blocked = sets.blocked;
    } catch (e) {
      statusEl.textContent = e.message || String(e);
      return;
    }

    const slots = generateDaySlots(dateStr);
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

      if (booked.has(t)) {
        b.disabled = true;
        b.classList.add('esp-slot--booked');
        b.title = 'Reserva confirmada ou em pagamento — não podes alterar aqui';
        slotsEl.appendChild(b);
        return;
      }

      if (blocked.has(t)) {
        b.classList.add('esp-slot--blocked');
        b.title = 'Fechado por ti — toca para reabrir';
        b.addEventListener('click', async () => {
          statusEl.textContent = 'A atualizar…';
          b.disabled = true;
          const iso = slot.dt.toISOString();
          const { error } = await sb
            .from('specialist_calendar_blocks')
            .delete()
            .eq('specialist_id', specialistId)
            .eq('starts_at', iso);
          b.disabled = false;
          if (error) {
            statusEl.textContent = error.message || String(error);
            return;
          }
          statusEl.textContent = 'Horário reaberto ao público.';
          await renderDay();
        });
        slotsEl.appendChild(b);
        return;
      }

      b.title = 'Disponível — toca para fechar ao público';
      b.addEventListener('click', async () => {
        statusEl.textContent = 'A atualizar…';
        b.disabled = true;
        const iso = slot.dt.toISOString();
        const { error } = await sb.from('specialist_calendar_blocks').insert({
          specialist_id: specialistId,
          starts_at: iso,
        });
        b.disabled = false;
        if (error) {
          statusEl.textContent = error.message || String(error);
          return;
        }
        statusEl.textContent = 'Horário fechado ao público.';
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
