/**
 * especialistas.html — catálogo estilo streaming, agendamento e vídeo (Jitsi Meet).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const PRICE_LABEL = 'R$ 49,90';
const JITSI_BASE = 'https://meet.jit.si';

/** Capa quando não há URL ou a imagem remota falha ao carregar. */
const SPEC_COVER_FALLBACK =
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=600&fit=crop&q=80';

/** Aceita só http(s); normaliza; vazio se inválido. */
function specialistCoverUrl(raw) {
  const t = raw != null ? String(raw).trim() : '';
  if (!t) return '';
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

const PAY_METHOD_LABELS = {
  pix: 'Pix',
  credit_card: 'cartão de crédito (1x)',
};

async function createMercadoPagoPreference(supabase, payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('not_authenticated');

  const site =
    (typeof window.AURA_APP_PUBLIC_URL === 'string' && window.AURA_APP_PUBLIC_URL.trim()) ||
    (typeof window !== 'undefined' && window.location?.origin && /^https?:\/\//i.test(window.location.origin)
      ? window.location.origin
      : '');

  const headers = {};
  if (site) headers['X-Public-Site-Url'] = site.replace(/\/$/, '');

  const { data, error } = await supabase.functions.invoke('mercadopago-create-preference', {
    body: payload,
    headers: Object.keys(headers).length ? headers : undefined,
  });

  if (error) {
    const err = new Error(error.message || 'invoke_failed');
    let bodyJson = null;
    try {
      if (error.context && typeof error.context.json === 'function') {
        bodyJson = await error.context.json();
      }
    } catch {
      /* ignore */
    }
    const code = bodyJson?.code || bodyJson?.error;
    const msg = bodyJson?.message || bodyJson?.msg || '';
    err.detail = bodyJson?.detail ?? bodyJson ?? error.message;
    err.hint = bodyJson?.hint;

    const notFound =
      code === 'NOT_FOUND' ||
      /requested function was not found/i.test(String(msg)) ||
      /requested function was not found/i.test(String(error.message));

    if (notFound) {
      err.detail =
        'A função mercadopago-create-preference não está publicada neste projeto Supabase. SQL e secrets não chegam para isto: é preciso fazer deploy (no PC, na pasta do projeto): npx supabase login && npx supabase functions deploy mercadopago-create-preference --project-ref ahjhjzdmkkrcgbuxmhww --no-verify-jwt && npx supabase functions deploy mercadopago-webhook --project-ref ahjhjzdmkkrcgbuxmhww --no-verify-jwt — ou corre o ficheiro supabase/deploy-mp-functions.cmd';
    }

    const jwtAlgoBlock = /UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM|JWT algorithm ES256/i.test(
      `${error.message || ''} ${JSON.stringify(bodyJson || {})}`
    );
    if (jwtAlgoBlock) {
      err.detail =
        'O Supabase ainda está a verificar o JWT na entrada da função (incompatível com ES256). Publica de novo com: supabase\\deploy-mp-functions.cmd (inclui --no-verify-jwt) ou, no terminal na pasta MaesAtipicas: npx supabase functions deploy mercadopago-create-preference --project-ref ahjhjzdmkkrcgbuxmhww --no-verify-jwt';
    }
    throw err;
  }

  if (data?.pix && data?.intent_id) {
    return data;
  }
  if (!data?.init_point) {
    const err = new Error('no_checkout_payload');
    err.detail = data;
    throw err;
  }
  return data;
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

/**
 * Horário comercial simplificado: 08:00–17:30.
 * 30 min: slots de meia em meia hora (último início 17:00).
 * 60 min: só horas cheias, último início 16:00 (termina às 17:00).
 */
function generateDaySlots(dateStr, durationMinutes = 30) {
  const slots = [];
  const minLead = 10 * 60 * 1000;
  const nowLimit = new Date(Date.now() + minLead);
  const useHourly = Number(durationMinutes) === 60;
  if (useHourly) {
    for (let h = 8; h <= 16; h++) {
      const dt = combineLocalDateAndSlot(dateStr, h, 0);
      if (dt <= nowLimit) continue;
      slots.push({ hour: h, minute: 0, dt });
    }
    return slots;
  }
  for (let h = 8; h <= 17; h++) {
    for (const mm of [0, 30]) {
      if (h === 17 && mm === 30) break;
      const dt = combineLocalDateAndSlot(dateStr, h, mm);
      if (dt <= nowLimit) continue;
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
  const payMethodUi = document.getElementById('spec-pay-method-ui');
  const stepPixQr = document.getElementById('spec-step-pix-qr');
  const specPixQrImg = document.getElementById('spec-pix-qr-img');
  const specPixCopy = document.getElementById('spec-pix-copy');
  const specPixCopyBtn = document.getElementById('spec-pix-copy-btn');
  const specPixTicketLink = document.getElementById('spec-pix-ticket-link');
  const specPixWait = document.getElementById('spec-pix-wait');
  const specPixBackPay = document.getElementById('spec-pix-back-pay');

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
  let pixPollStop = false;

  function updateFinalPayLabel() {
    if (!btnFinalPay) return;
    if (selectedPaymentMethod === 'pix') {
      btnFinalPay.textContent = `Gerar Pix (QR) — ${PRICE_LABEL}`;
    } else if (selectedPaymentMethod === 'credit_card') {
      btnFinalPay.textContent = `Ir pagar no Mercado Pago — ${PRICE_LABEL}`;
    } else {
      btnFinalPay.textContent = `Continuar — ${PRICE_LABEL}`;
    }
  }

  function hidePixQrStep() {
    pixPollStop = true;
    if (stepPixQr) stepPixQr.hidden = true;
    if (payMethodUi) payMethodUi.hidden = false;
    if (specPixQrImg) {
      specPixQrImg.hidden = true;
      specPixQrImg.removeAttribute('src');
    }
    if (specPixCopy) specPixCopy.value = '';
    if (specPixTicketLink) {
      specPixTicketLink.hidden = true;
      specPixTicketLink.href = '#';
    }
    if (specPixWait) specPixWait.textContent = 'A aguardar confirmação do pagamento…';
  }

  function showScheduleStep() {
    hidePixQrStep();
    if (stepSchedule) stepSchedule.hidden = false;
    if (stepPayment) stepPayment.hidden = true;
    selectedPaymentMethod = null;
    payOptions.forEach((opt) => {
      opt.classList.remove('spec-pay-option--selected');
      opt.setAttribute('aria-checked', 'false');
    });
    if (btnFinalPay) {
      btnFinalPay.disabled = true;
      updateFinalPayLabel();
    }
  }

  function showPaymentStep() {
    hidePixQrStep();
    if (stepSchedule) stepSchedule.hidden = true;
    if (stepPayment) stepPayment.hidden = false;
    if (paySummary && pickedSlot) {
      const dm = Number(selectedSpecialist?.consultation_duration_minutes) === 60 ? 60 : 30;
      paySummary.textContent = `${formatDateTimeLong(pickedSlot.toISOString())} · ${dm} min · ${PRICE_LABEL}`;
    }
    bookStatus.textContent = '';
    updateFinalPayLabel();
  }

  function resetBookingModal() {
    showScheduleStep();
    bookStatus.textContent = '';
  }

  async function pollPixIntentUntilResolved(intentId) {
    pixPollStop = false;
    for (let i = 0; i < 150; i++) {
      if (pixPollStop) return;
      const { data } = await supabase
        .from('consultation_checkout_intents')
        .select('status')
        .eq('id', intentId)
        .maybeSingle();
      if (data?.status === 'completed') {
        if (specPixWait) specPixWait.textContent = 'Pagamento confirmado.';
        bookStatus.textContent = 'Consulta agendada. Fecha este painel ou atualiza a página para ver o link da videochamada.';
        if (btnFinalPay) btnFinalPay.disabled = false;
        await loadSpecialists();
        await loadNextBooking();
        window.setTimeout(() => {
          closeModal(backdrop, panel, resetBookingModal);
        }, 1600);
        return;
      }
      if (data?.status === 'failed') {
        if (specPixWait) specPixWait.textContent = 'Este Pix não foi concluído. Podes tentar de novo.';
        bookStatus.textContent =
          'O pagamento falhou ou o horário já não está disponível. Escolhe outro meio ou outro horário.';
        if (btnFinalPay) btnFinalPay.disabled = false;
        hidePixQrStep();
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (specPixWait) specPixWait.textContent = 'Ainda a aguardar… Se já pagaste, pode demorar um minuto.';
  }

  async function loadSpecialists() {
    const { data, error } = await supabase
      .from('specialists')
      .select('id, display_name, specialty, bio, photo_url, sort_order, consultation_duration_minutes')
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

      const poster = document.createElement('div');
      poster.className = 'spec-card__poster';
      const img = document.createElement('img');
      const resolved = specialistCoverUrl(s.photo_url);
      img.src = resolved || SPEC_COVER_FALLBACK;
      img.alt = '';
      img.width = 200;
      img.height = 300;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function onCoverErr() {
        img.removeEventListener('error', onCoverErr);
        if (img.src !== SPEC_COVER_FALLBACK) img.src = SPEC_COVER_FALLBACK;
      });
      poster.appendChild(img);
      const grad = document.createElement('div');
      grad.className = 'spec-card__grad';
      poster.appendChild(grad);
      const meta = document.createElement('div');
      meta.className = 'spec-card__meta';
      const nameEl = document.createElement('div');
      nameEl.className = 'spec-card__name';
      nameEl.textContent = s.display_name;
      const specEl = document.createElement('div');
      specEl.className = 'spec-card__spec';
      specEl.textContent = s.specialty;
      meta.appendChild(nameEl);
      meta.appendChild(specEl);
      poster.appendChild(meta);
      btn.appendChild(poster);

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
    const slotDur = Number(selectedSpecialist.consultation_duration_minutes) === 60 ? 60 : 30;
    const slots = generateDaySlots(dateStr, slotDur);
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
      updateFinalPayLabel();
    });
  });

  if (specPixCopyBtn && specPixCopy) {
    specPixCopyBtn.addEventListener('click', async () => {
      const t = specPixCopy.value || '';
      if (!t) return;
      try {
        await navigator.clipboard.writeText(t);
        if (bookStatus) bookStatus.textContent = 'Código Pix copiado.';
      } catch {
        specPixCopy.focus();
        specPixCopy.select();
        if (bookStatus) bookStatus.textContent = 'Seleciona o código e copia manualmente (Ctrl+C).';
      }
    });
  }

  if (specPixBackPay) {
    specPixBackPay.addEventListener('click', () => {
      pixPollStop = true;
      hidePixQrStep();
      if (bookStatus) bookStatus.textContent = '';
    });
  }

  if (btnFinalPay) {
    btnFinalPay.addEventListener('click', async () => {
      if (!selectedSpecialist || !pickedSlot || !selectedPaymentMethod) return;
      bookStatus.textContent =
        selectedPaymentMethod === 'pix' ? 'A gerar o Pix…' : 'A abrir o Mercado Pago…';
      btnFinalPay.disabled = true;
      const iso = pickedSlot.toISOString();
      try {
        const out = await createMercadoPagoPreference(supabase, {
          specialist_id: selectedSpecialist.id,
          starts_at: iso,
          payment_method: selectedPaymentMethod,
        });
        if (out.init_point) {
          window.location.href = out.init_point;
          return;
        }
        if (out.pix && out.intent_id && payMethodUi && stepPixQr) {
          payMethodUi.hidden = true;
          stepPixQr.hidden = false;
          const pix = out.pix;
          const b64 = typeof pix.qr_code_base64 === 'string' ? pix.qr_code_base64.trim() : '';
          const emv = typeof pix.qr_code === 'string' ? pix.qr_code.trim() : '';
          if (specPixCopy) specPixCopy.value = emv;
          if (specPixQrImg) {
            if (b64) {
              specPixQrImg.src = `data:image/png;base64,${b64}`;
              specPixQrImg.hidden = false;
            } else {
              specPixQrImg.hidden = true;
              specPixQrImg.removeAttribute('src');
            }
          }
          if (specPixTicketLink && pix.ticket_url) {
            specPixTicketLink.href = String(pix.ticket_url);
            specPixTicketLink.hidden = false;
          } else if (specPixTicketLink) {
            specPixTicketLink.hidden = true;
          }
          if (bookStatus) bookStatus.textContent = '';
          void pollPixIntentUntilResolved(String(out.intent_id));
          return;
        }
        throw new Error('no_checkout_payload');
      } catch (e) {
        const d = e?.detail;
        const detailStr =
          typeof d === 'string'
            ? d
            : d && typeof d === 'object'
              ? JSON.stringify(d).slice(0, 420)
              : '';
        const hint = e?.hint ? String(e.hint).slice(0, 280) : '';
        let msg = 'Não foi possível abrir o pagamento.';
        const parts = [msg];
        if (e?.message === 'network' && e.detail) parts.push(e.detail);
        if (detailStr) parts.push(detailStr);
        if (hint) parts.push(hint);
        const raw = `${e?.message || ''} ${detailStr} ${hint}`;
        if (raw.includes('missing_app_public_url_or_origin')) {
          parts.length = 1;
          parts.push(
            'Define o secret APP_PUBLIC_URL no Supabase (ex.: https://maes-pi.vercel.app) ou confirma que abres a app em HTTPS.'
          );
        } else if (raw.includes('server_misconfigured')) {
          parts.length = 1;
          parts.push('Configura MERCADOPAGO_ACCESS_TOKEN nas secrets da Edge Function.');
        } else if (raw.includes('intent_create_failed')) {
          parts.length = 1;
          parts.push(
            'Falha ao criar intenção: aplica a migração 20260410190000 e confirma que o teu utilizador tem linha em profiles.'
          );
        } else if (raw.includes('UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM') || raw.includes('ES256')) {
          parts.length = 1;
          parts.push(
            'O projeto Supabase precisa de republicar a função com JWT desligado no gateway. Corre supabase\\deploy-mp-functions.cmd ou: npx supabase functions deploy mercadopago-create-preference --project-ref ahjhjzdmkkrcgbuxmhww --no-verify-jwt'
          );
        } else if (e?.message === 'no_checkout_payload') {
          parts.length = 1;
          parts.push('Resposta inesperada do servidor de pagamento. Recarrega a página e tenta de novo.');
        } else if (raw.includes('mercadopago_order_error') || raw.includes('pix_order_no_qr')) {
          parts.length = 1;
          parts.push(
            'O Mercado Pago não devolveu o QR Pix. Confirma credenciais de produção e que a conta tem Pix / Orders ativos.'
          );
        } else if (raw.includes('mercadopago_error') || raw.includes('http_')) {
          parts.push('Token Mercado Pago inválido ou MP a rejeitar o pedido — vê o painel MP.');
        }
        bookStatus.textContent = parts.filter(Boolean).join(' ');
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
