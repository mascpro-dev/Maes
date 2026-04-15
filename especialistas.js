/**
 * especialistas.html — catálogo estilo streaming, agendamento e vídeo (Jitsi Meet).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const PRICE_LABEL = 'R$ 49,90';
const JITSI_BASE = 'https://meet.jit.si';

const PAY_METHOD_LABELS = {
  pix: 'Pix',
  credit_card: 'cartão de crédito (1x)',
};

function mpCreatePreferenceUrl() {
  const base = (window.AURA_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/functions/v1/mercadopago-create-preference`;
}

async function createMercadoPagoPreference(supabase, payload) {
  const url = mpCreatePreferenceUrl();
  if (!url) throw new Error('missing_supabase_url');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('not_authenticated');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: window.AURA_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || 'mp_preference_failed');
    err.detail = json.detail || json;
    throw err;
  }
  if (!json.init_point) throw new Error('no_init_point');
  return json;
}

function pad(n) {
  return String(n).padStart(2, '0');
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

/** Início e fim do dia local em ISO (UTC) para consultas à API */
function localDayRangeISO(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

function combineLocalDateAndSlot(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

/** Gera slots 08:00–17:30 de 30 em 30 min (horário comercial simplificado) */
function generateDaySlots(dateStr) {
  const slots = [];
  for (let h = 8; h <= 17; h++) {
    for (const mm of [0, 30]) {
      if (h === 17 && mm === 30) break;
      const dt = combineLocalDateAndSlot(dateStr, h, mm);
      if (dt <= new Date(Date.now() + 10 * 60 * 1000)) continue;
      slots.push({ hour: h, minute: mm, dt });
    }
  }
  return slots;
}

function formatSlotLabel(dt) {
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTimeLong(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function openModal(backdrop, panel) {
  backdrop.classList.add('spec-modal-backdrop--open');
  panel.classList.add('spec-modal--open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeModal(backdrop, panel, onClose) {
  backdrop.classList.remove('spec-modal-backdrop--open');
  panel.classList.remove('spec-modal--open');
  backdrop.setAttribute('aria-hidden', 'true');
  if (typeof onClose === 'function') onClose();
}

function jitsiIframeUrl(roomSlug, displayName) {
  const name = encodeURIComponent(displayName || 'Mãe Aura');
  return `${JITSI_BASE}/${encodeURIComponent(roomSlug)}#config.prejoinPageEnabled=false&userInfo.displayName=${name}&config.startWithAudioMuted=false&config.startWithVideoMuted=false`;
}

async function main() {
  const rail = document.getElementById('spec-rail');
  const heroStatus = document.getElementById('spec-hero-status');
  const nextBlock = document.getElementById('spec-next-booking');
  const nextTitle = document.getElementById('spec-next-title');
  const nextTime = document.getElementById('spec-next-time');
  const nextRoom = document.getElementById('spec-next-room');
  const jitsiMount = document.getElementById('spec-jitsi-mount');
  const btnEnterVideo = document.getElementById('spec-btn-enter-video');
  const btnLeaveVideo = document.getElementById('spec-btn-leave-video');
  const videoStatus = document.getElementById('spec-video-status');

  const backdrop = document.getElementById('spec-modal-backdrop');
  const panel = document.getElementById('spec-modal');
  const modalClose = document.getElementById('spec-modal-close');
  const modalTitle = document.getElementById('spec-modal-title');
  const modalSpec = document.getElementById('spec-modal-spec');
  const modalBio = document.getElementById('spec-modal-bio');
  const dateInput = document.getElementById('spec-book-date');
  const slotsEl = document.getElementById('spec-slots');
  const stepSchedule = document.getElementById('spec-step-schedule');
  const stepPayment = document.getElementById('spec-step-payment');
  const btnConfirmPay = document.getElementById('spec-btn-confirm-pay');
  const btnBackSchedule = document.getElementById('spec-btn-back-schedule');
  const btnFinalPay = document.getElementById('spec-btn-final-pay');
  const paySummary = document.getElementById('spec-pay-summary');
  const payOptions = document.querySelectorAll('.spec-pay-option');
  const bookStatus = document.getElementById('spec-book-status');
  const priceCta = document.getElementById('spec-price-cta');

  const supabase = await getClient();
  if (!supabase || !rail) return;

  const urlParams = new URLSearchParams(window.location.search);
  const mpReturn = urlParams.get('mp');
  const mpIntentId = urlParams.get('intent');

  let specialists = [];
  let selectedSpecialist = null;
  let pickedSlot = null;
  let selectedPaymentMethod = null;
  let lastBookingRoom = null;

  function showScheduleStep() {
    if (stepSchedule) stepSchedule.hidden = false;
    if (stepPayment) stepPayment.hidden = true;
    selectedPaymentMethod = null;
    payOptions.forEach((opt) => {
      opt.classList.remove('spec-pay-option--selected');
      opt.setAttribute('aria-checked', 'false');
    });
    if (btnFinalPay) btnFinalPay.disabled = true;
  }

  function showPaymentStep() {
    if (stepSchedule) stepSchedule.hidden = true;
    if (stepPayment) stepPayment.hidden = false;
    if (paySummary && pickedSlot) {
      paySummary.textContent = `${formatDateTimeLong(pickedSlot.toISOString())} · ${PRICE_LABEL}`;
    }
    bookStatus.textContent = '';
  }

  function resetBookingModal() {
    showScheduleStep();
    bookStatus.textContent = '';
  }

  async function loadSpecialists() {
    const { data, error } = await supabase
      .from('specialists')
      .select('id, display_name, specialty, bio, photo_url, sort_order')
      .order('sort_order', { ascending: true });
    if (error) {
      if (heroStatus) {
        heroStatus.textContent =
          'Não foi possível carregar a lista. Confirma se a migração dos especialistas já foi aplicada no Supabase.';
      }
      console.warn('[Especialistas]', error);
      return;
    }
    specialists = data || [];
    rail.innerHTML = '';
    specialists.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spec-card';
      btn.setAttribute('aria-label', `Ver ${s.display_name}, ${s.specialty}`);
      const photo =
        (s.photo_url && String(s.photo_url).trim()) ||
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=600&fit=crop&q=80';
      btn.innerHTML = `
        <div class="spec-card__poster">
          <img src="${photo.replace(/"/g, '&quot;')}" alt="" loading="lazy" width="200" height="300" />
          <div class="spec-card__grad"></div>
          <div class="spec-card__meta">
            <div class="spec-card__name"></div>
            <div class="spec-card__spec"></div>
          </div>
        </div>
      `;
      btn.querySelector('.spec-card__name').textContent = s.display_name;
      btn.querySelector('.spec-card__spec').textContent = s.specialty;
      btn.addEventListener('click', () => openSpecialistModal(s));
      rail.appendChild(btn);
    });
    if (heroStatus && !urlParams.get('mp')) {
      heroStatus.textContent = '';
    }
  }

  async function loadNextBooking() {
    const { data: rows, error } = await supabase
      .from('consultation_bookings')
      .select('id, starts_at, jitsi_room_slug, specialist_id, status')
      .eq('status', 'confirmed')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(3);

    if (error || !rows?.length) {
      nextBlock.hidden = true;
      if (nextBlock) delete nextBlock.dataset.roomSlug;
      if (nextRoom) nextRoom.innerHTML = '';
      return;
    }

    const row = rows[0];
    const spec = specialists.find((x) => x.id === row.specialist_id);
    const name = spec?.display_name || 'Especialista';
    const slug = row.jitsi_room_slug;
    nextBlock.hidden = false;
    nextTitle.textContent = name;
    nextTime.textContent = formatDateTimeLong(row.starts_at);
    nextBlock.dataset.roomSlug = slug || '';
    lastBookingRoom = slug;

    if (nextRoom) {
      nextRoom.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'spec-next__room-wrap';
      const link = document.createElement('a');
      link.href = `${JITSI_BASE}/${encodeURIComponent(slug)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'spec-next__jitsi-link';
      link.textContent = 'Entrar na videochamada (Jitsi)';
      const slugEl = document.createElement('span');
      slugEl.className = 'spec-next__room-slug';
      slugEl.textContent = slug;
      wrap.appendChild(link);
      wrap.appendChild(slugEl);
      nextRoom.appendChild(wrap);
    }
  }

  async function refreshBookedSet(specId, dateStr) {
    const { from, to } = localDayRangeISO(dateStr);
    const { data, error } = await supabase.rpc('list_specialist_booked_starts', {
      p_specialist_id: specId,
      p_from: from,
      p_to: to,
    });
    if (error) {
      console.warn('[Especialistas] booked slots', error);
      return new Set();
    }
    const set = new Set();
    (data || []).forEach((r) => {
      if (r.starts_at) set.add(new Date(r.starts_at).getTime());
    });
    return set;
  }

  async function renderSlots() {
    if (!selectedSpecialist || !dateInput.value) return;
    const dateStr = dateInput.value;
    const booked = await refreshBookedSet(selectedSpecialist.id, dateStr);
    const slots = generateDaySlots(dateStr);
    slotsEl.innerHTML = '';
    pickedSlot = null;
    if (btnConfirmPay) btnConfirmPay.disabled = true;

    slots.forEach((slot) => {
      const t = slot.dt.getTime();
      const taken = booked.has(t);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'spec-slot';
      b.textContent = formatSlotLabel(slot.dt);
      b.disabled = taken;
      if (taken) b.title = 'Horário já ocupado';
      b.addEventListener('click', () => {
        slotsEl.querySelectorAll('.spec-slot').forEach((x) => x.classList.remove('spec-slot--picked'));
        b.classList.add('spec-slot--picked');
        pickedSlot = slot.dt;
        if (btnConfirmPay) btnConfirmPay.disabled = false;
      });
      slotsEl.appendChild(b);
    });

    if (!slots.length) {
      const p = document.createElement('p');
      p.style.cssText = 'color:rgba(255,255,255,.5);font-size:.85rem;';
      p.textContent = 'Não há horários disponíveis para este dia (ou todos já passaram).';
      slotsEl.appendChild(p);
    }
  }

  function openSpecialistModal(s) {
    selectedSpecialist = s;
    modalTitle.textContent = s.display_name;
    modalSpec.textContent = s.specialty;
    modalBio.textContent = s.bio || 'Consulta de apoio com valor social para mães da comunidade.';
    bookStatus.textContent = '';
    showScheduleStep();

    const today = new Date();
    dateInput.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    dateInput.min = dateInput.value;

    openModal(backdrop, panel);
    renderSlots();
  }

  dateInput.addEventListener('change', () => {
    showScheduleStep();
    renderSlots();
  });

  modalClose.addEventListener('click', () => closeModal(backdrop, panel, resetBookingModal));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop, panel, resetBookingModal);
  });

  if (btnConfirmPay) {
    btnConfirmPay.addEventListener('click', () => {
      if (!selectedSpecialist || !pickedSlot) return;
      showPaymentStep();
    });
  }

  if (btnBackSchedule) {
    btnBackSchedule.addEventListener('click', () => {
      showScheduleStep();
      bookStatus.textContent = '';
    });
  }

  payOptions.forEach((opt) => {
    opt.addEventListener('click', () => {
      const m = opt.getAttribute('data-method');
      if (!m) return;
      selectedPaymentMethod = m;
      payOptions.forEach((o) => {
        o.classList.remove('spec-pay-option--selected');
        o.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('spec-pay-option--selected');
      opt.setAttribute('aria-checked', 'true');
      if (btnFinalPay) btnFinalPay.disabled = false;
    });
  });

  if (btnFinalPay) {
    btnFinalPay.addEventListener('click', async () => {
      if (!selectedSpecialist || !pickedSlot || !selectedPaymentMethod) return;
      bookStatus.textContent = 'A abrir o Mercado Pago…';
      btnFinalPay.disabled = true;
      const iso = pickedSlot.toISOString();
      try {
        const out = await createMercadoPagoPreference(supabase, {
          specialist_id: selectedSpecialist.id,
          starts_at: iso,
          payment_method: selectedPaymentMethod,
        });
        window.location.href = out.init_point;
      } catch (e) {
        const raw = `${e?.message || ''} ${e?.detail ? JSON.stringify(e.detail) : ''}`;
        let msg = 'Não foi possível abrir o pagamento. Verifica a rede ou configuração.';
        if (raw.includes('missing_app_public_url_or_origin')) {
          msg =
            'Define APP_PUBLIC_URL nas secrets da função (URL https do site) ou abre a app a partir do domínio público.';
        } else if (raw.includes('server_misconfigured') || raw.includes('misconfigured')) {
          msg =
            'Mercado Pago ainda não configurado: adiciona MERCADOPAGO_ACCESS_TOKEN nas secrets da Edge Function.';
        } else if (raw.includes('intent_create_failed')) {
          msg = 'Não foi possível preparar o checkout. Aplica a migração consultation_checkout_intents no Supabase.';
        }
        bookStatus.textContent = msg;
        btnFinalPay.disabled = false;
      }
    });
  }

  if (priceCta && rail) {
    priceCta.addEventListener('click', () => {
      rail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      rail.classList.add('spec-rail--pulse');
      window.setTimeout(() => rail.classList.remove('spec-rail--pulse'), 1200);
    });
  }

  function mountJitsi(roomSlug) {
    if (!jitsiMount || !roomSlug) return;
    jitsiMount.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('allow', 'camera; microphone; fullscreen; display-capture; autoplay');
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.title = 'Videochamada da consulta';
    iframe.src = jitsiIframeUrl(roomSlug, 'Mãe Aura');
    jitsiMount.appendChild(iframe);
    if (videoStatus) {
      videoStatus.textContent =
        'Sala aberta. Gravação na nuvem pelo Jitsi público não está disponível; para o profissional gravar com segurança, integra Jitsi as a Service ou similar em produção.';
    }
  }

  btnEnterVideo.addEventListener('click', () => {
    const room =
      lastBookingRoom ||
      (nextBlock && nextBlock.dataset && nextBlock.dataset.roomSlug ? nextBlock.dataset.roomSlug : '') ||
      '';
    if (!room) {
      if (videoStatus) videoStatus.textContent = 'Marca primeiro uma consulta para receberes o nome da sala.';
      return;
    }
    mountJitsi(room);
    btnLeaveVideo.disabled = false;
  });

  btnLeaveVideo.addEventListener('click', () => {
    if (jitsiMount) jitsiMount.innerHTML = '';
    if (videoStatus) videoStatus.textContent = 'Saíste da sala.';
    btnLeaveVideo.disabled = true;
  });

  await loadSpecialists();

  if (mpReturn === 'success' && mpIntentId && heroStatus) {
    heroStatus.textContent = 'A confirmar o pagamento no Mercado Pago…';
    let completed = false;
    for (let i = 0; i < 45; i++) {
      const { data } = await supabase
        .from('consultation_checkout_intents')
        .select('status')
        .eq('id', mpIntentId)
        .maybeSingle();
      if (data?.status === 'completed') {
        completed = true;
        break;
      }
      if (data?.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    try {
      history.replaceState({}, '', window.location.pathname || 'especialistas.html');
    } catch (err) {
      /* ignore */
    }
    if (completed) {
      heroStatus.textContent =
        'Pagamento confirmado. A tua consulta está agendada — usa o link da próxima consulta para entrar na videochamada.';
    } else {
      heroStatus.textContent =
        'A confirmação pode demorar um instante. Atualiza a página; se o pagamento falhou, volta a marcar um horário.';
    }
  } else if (mpReturn === 'failure' && heroStatus) {
    try {
      history.replaceState({}, '', window.location.pathname || 'especialistas.html');
    } catch (err) {
      /* ignore */
    }
    heroStatus.textContent = 'Pagamento não concluído no Mercado Pago. Podes tentar de novo.';
  } else if (mpReturn === 'pending' && heroStatus) {
    try {
      history.replaceState({}, '', window.location.pathname || 'especialistas.html');
    } catch (err) {
      /* ignore */
    }
    heroStatus.textContent = 'Pagamento pendente ou em análise. Volta daqui a pouco.';
  }

  await loadNextBooking();
}

main();
