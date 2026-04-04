/**
 * Dashboard Aura — Supabase
 * - mood_logs (schema Aura): mood, energy_score (guardamos 1–5 = nível do emoji), user_id = auth.uid()
 * - RLS: só funciona com sessão real (anon ou e-mail). UUID em localStorage NÃO bate com auth.uid().
 * - refunds + Storage `receipts`
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const MOOD_SCORE_BY_SLUG = {
  exausta: 1,
  cansada: 2,
  ok: 3,
  bem: 4,
  radiante: 5,
};

/** Colunas em `refunds` (além de user_id) */
const REFUND_STATUS = 'pendente';
const STORAGE_BUCKET = 'receipts';

function slugFromBtnId(id) {
  return String(id || '').replace(/^mood-/, '');
}

/** Interpreta linha mood_logs: energy_score 1–5, legado 22–94, ou slug mood */
function moodScoreFromRow(row) {
  if (row == null) return null;
  if (row.mood_score != null && row.mood_score !== '' && Number.isFinite(Number(row.mood_score))) {
    const v = Number(row.mood_score);
    return Math.min(5, Math.max(1, v));
  }
  const e = row.energy_score;
  if (e != null && e !== '' && Number.isFinite(Number(e))) {
    const n = Number(e);
    if (n >= 1 && n <= 5) return n;
    if (n <= 30) return 1;
    if (n <= 45) return 2;
    if (n <= 62) return 3;
    if (n <= 85) return 4;
    return 5;
  }
  const slug = row.mood;
  if (slug && MOOD_SCORE_BY_SLUG[slug] != null) return MOOD_SCORE_BY_SLUG[slug];
  return null;
}

/** Sempre auth.users.id — RLS exige sessão real (ex.: e-mail + senha). */
async function resolveSupabaseSession(supabase) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  return {
    userId: uid || null,
    session,
    authError: uid ? null : new Error('Sem sessão'),
  };
}

const TIP_BY_CHALLENGE = {
  sono: 'Uma rotina de sono simples — horário fixo para desligar — ajuda você e a criança a prever o fim do dia.',
  alimentacao: 'Explorar um alimento de cada vez reduz a sobrecarga sensorial à mesa.',
  escola: 'Check-ins curtos com a escola mantêm todos alinhados sem esgotar você.',
  comportamento: 'Nomear o sentimento antes da regra (“estás frustrada…”) costuma abrir espaço para acalmar.',
  rotina: 'Pré-visualizar o dia em duas frases diminui imprevistos para o cérebro.',
  saude_mental: 'Cinco minutos só seus — chá, ar fresco — não é luxo; é combustível.',
  inclusao_social: 'Encontros curtos e previsíveis socializam sem esgotar.',
  rede_apoio: 'Pedir ajuda específica (“podes ficar 1h?”) funciona melhor que “preciso de tudo”.',
};

const DEFAULT_TIP = 'Respirar fundo 3 vezes antes de responder seu filho pode mudar tudo.';

function greetingForHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function fetchRefundPendingCount(supabase, userId) {
  const { count, error } = await supabase
    .from('refunds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', REFUND_STATUS);
  if (error) return null;
  return typeof count === 'number' ? count : 0;
}

/** Perfil + filhos → localStorage, topbar, cards e dica do dia. */
async function hydrateDashboardContext(supabase, userId) {
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select(
      'full_name, email, phone, onboarding_challenges, avatar_url, bio, nome_crianca, next_appointment_at, next_appointment_title, next_appointment_location'
    )
    .eq('id', userId)
    .maybeSingle();

  if (pErr) console.warn('[Aura] profiles read:', pErr.message);

  let children = [];
  const { data: kids, error: cErr } = await supabase
    .from('children')
    .select('nome, data_nascimento, diagnosticos, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (cErr) console.warn('[Aura] children read:', cErr.message);
  else children = kids || [];

  const sub = document.getElementById('greeting-sub');
  if (sub) sub.textContent = `${greetingForHour()} ✨`;

  const displayName = (profile?.full_name || '').trim() || 'Bem-vinda';
  const h1 = document.getElementById('greeting-name');
  if (h1) h1.textContent = displayName;

  if (typeof AuraAuth !== 'undefined' && profile) {
    const patch = {};
    if (profile.full_name) patch.nomeCompleto = profile.full_name;
    if (profile.email) patch.email = profile.email;
    if (profile.phone != null && profile.phone !== '') patch.phone = profile.phone;
    if (profile.onboarding_challenges && profile.onboarding_challenges.length) {
      patch.onboardingChallenges = profile.onboarding_challenges;
    }
    if (profile.avatar_url) patch.avatarUrl = profile.avatar_url;
    if (profile.bio != null && String(profile.bio).trim() !== '') patch.bio = String(profile.bio).trim();
    if (Object.keys(patch).length) AuraAuth.saveProfile(patch);
    AuraAuth.applyProfileToUI?.();
  }

  const primaryChild = children[0];
  const childName = primaryChild?.nome?.trim() || profile?.nome_crianca?.trim() || '';

  const customTitle = (profile?.next_appointment_title || '').trim();
  const locText = (profile?.next_appointment_location || '').trim();
  const apptIso = profile?.next_appointment_at || null;
  const apptDate = apptIso ? new Date(apptIso) : null;
  const apptValid = apptDate && !Number.isNaN(apptDate.getTime());

  const apptTitle = document.getElementById('appointment-title');
  if (apptTitle) {
    if (customTitle) apptTitle.textContent = customTitle;
    else apptTitle.textContent = childName ? `Próxima terapia de ${childName}` : 'Próxima terapia';
  }

  const timeEl = document.getElementById('appointment-time');
  const locEl = document.getElementById('appointment-location');
  const cdLabel = document.getElementById('appointment-countdown-label');

  if (apptValid) {
    if (timeEl) {
      timeEl.textContent = apptDate.toLocaleString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (locEl) locEl.textContent = locText || 'Local a definir com a equipe';
    window.AuraDashboard?.setAppointmentTarget?.(apptDate.toISOString(), {});
    if (cdLabel) cdLabel.textContent = 'Em ';
  } else {
    if (timeEl) timeEl.textContent = 'Horário a combinar com a clínica';
    if (locEl) locEl.textContent = locText || 'Local a definir com a equipe';
    window.AuraDashboard?.setAppointmentTarget?.(null, { countdownText: 'a combinar' });
    if (cdLabel) cdLabel.textContent = '';
  }

  const tipEl = document.getElementById('tip-text');
  if (tipEl) {
    const challenges = profile?.onboarding_challenges || [];
    let tip = DEFAULT_TIP;
    for (const slug of challenges) {
      if (TIP_BY_CHALLENGE[slug]) {
        tip = TIP_BY_CHALLENGE[slug];
        break;
      }
    }
    tipEl.textContent = `"${tip}"`;
  }

  const dirs = document.getElementById('btn-directions');
  if (dirs) {
    const mapsQ = locText || '';
    if (mapsQ) dirs.setAttribute('data-maps-query', mapsQ);
    else dirs.removeAttribute('data-maps-query');
    dirs.setAttribute('data-place', childName ? `terapia (${childName})` : 'o local da terapia');
    dirs.setAttribute(
      'aria-label',
      mapsQ
        ? 'Abrir rotas no mapa para o local do compromisso'
        : childName
          ? `Como chegar à terapia de ${childName}`
          : 'Como chegar à terapia'
    );
  }

  const pending = await fetchRefundPendingCount(supabase, userId);
  if (pending != null && typeof window.AuraDashboard?.setRefundPendingCount === 'function') {
    window.AuraDashboard.setRefundPendingCount(pending);
  } else {
    window.AuraDashboard?.refreshRefundPendingLabel?.();
  }
}

/** Média de mood_score nos últimos 7 dias (inclui hoje). */
async function fetchSevenDayMoodAverage(supabase, userId) {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('mood_logs')
    .select('energy_score, mood, created_at')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[Aura] mood_logs read:', error.message);
    return { avg: null, count: 0, lastSlug: null };
  }

  const rows = data || [];
  if (!rows.length) return { avg: null, count: 0, lastSlug: null };

  const scores = rows.map(moodScoreFromRow).filter((s) => s != null);
  if (!scores.length) return { avg: null, count: rows.length, lastSlug: rows[0]?.mood || null };

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { avg, count: scores.length, lastSlug: rows[0]?.mood || null };
}

function setActiveMoodButton(slug) {
  document.querySelectorAll('.mood-btn').forEach((btn) => {
    const s = slugFromBtnId(btn.id);
    btn.classList.toggle('mood-btn--active', s === slug);
  });
}

function injectRippleStyle() {
  if (document.getElementById('aura-ripple-style')) return;
  const style = document.createElement('style');
  style.id = 'aura-ripple-style';
  style.textContent = `@keyframes aura-ripple { to { transform:scale(2.5); opacity:0; } }`;
  document.head.appendChild(style);
}

function initMoodLocalFallback() {
  const moods = document.querySelectorAll('.mood-btn');
  if (!moods.length) return;
  injectRippleStyle();

  moods.forEach((btn) => {
    btn.addEventListener('click', () => {
      moods.forEach((b) => b.classList.remove('mood-btn--active'));
      btn.classList.add('mood-btn--active');
      if (navigator.vibrate) navigator.vibrate(30);
      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position:absolute;border-radius:50%;width:60px;height:60px;
        background:rgba(135,169,107,.28);transform:scale(0);
        animation:aura-ripple .4s ease forwards;top:50%;left:50%;
        margin:-30px 0 0 -30px;pointer-events:none;`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);

      const slug = slugFromBtnId(btn.id);
      const score = MOOD_SCORE_BY_SLUG[slug] ?? 3;
      window.AuraDashboard?.setBatteryFromMoodAverage?.(score, { sampleCount: 1, localOnly: true });
    });
  });
}

function initMoodWithSupabase(supabase, userId) {
  injectRippleStyle();
  const moods = document.querySelectorAll('.mood-btn');

  moods.forEach((btn) => {
    btn.addEventListener('click', async () => {
      moods.forEach((b) => b.classList.remove('mood-btn--active'));
      btn.classList.add('mood-btn--active');
      if (navigator.vibrate) navigator.vibrate(30);

      btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position:absolute;border-radius:50%;width:60px;height:60px;
        background:rgba(135,169,107,.28);transform:scale(0);
        animation:aura-ripple .4s ease forwards;top:50%;left:50%;
        margin:-30px 0 0 -30px;pointer-events:none;`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 400);

      const slug = slugFromBtnId(btn.id);
      const moodScore = MOOD_SCORE_BY_SLUG[slug] ?? 3;

      const { error } = await supabase.from('mood_logs').insert({
        user_id: userId,
        mood: slug,
        energy_score: moodScore,
      });

      if (error) {
        if (typeof showToast === 'function') {
          showToast(
            error.message?.includes('RLS') || error.code === '42501'
              ? 'Sessão expirada. Entra de novo na Aura.'
              : 'Não foi possível salvar o humor: ' + (error.message || 'erro desconhecido')
          );
        }
        console.warn('[Aura] mood_logs insert:', error.message, error);
        return;
      }

      const { avg, count } = await fetchSevenDayMoodAverage(supabase, userId);
      window.AuraDashboard?.setBatteryFromMoodAverage?.(avg, { sampleCount: count });
      if (typeof showToast === 'function') showToast('Humor salvo ✨');
    });
  });
}

function extFromMime(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('heic')) return 'heic';
  return 'jpg';
}

/**
 * refunds: user_id, status, receipt_path (path no bucket; ajuste se usar image_url etc.)
 */
async function initRefundAssistant(supabase, userId) {
  const input = document.getElementById('input-refund-receipt');
  const btn = document.getElementById('btn-refund-camera');
  if (!input || !btn) return;

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !userId) return;

    if (typeof showToast === 'function') showToast('Enviando recibo…');

    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromMime(file)}`;

    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });

    if (upErr) {
      console.warn('[Aura] storage upload:', upErr.message);
      if (typeof showToast === 'function') {
        showToast('Falha no upload. Verifique o bucket receipts e políticas de Storage.');
      }
      return;
    }

    const { error: insErr } = await supabase.from('refunds').insert({
      user_id: userId,
      status: REFUND_STATUS,
      receipt_path: path,
    });

    if (insErr) {
      console.warn('[Aura] refunds insert:', insErr.message);
      if (typeof showToast === 'function') {
        showToast('Upload ok, mas falhou ao criar reembolso. Ajuste colunas da tabela refunds.');
      }
      return;
    }

    try {
      const raw = localStorage.getItem('aura_refund_pending');
      const n = raw == null ? 0 : parseInt(raw, 10);
      const next = (Number.isFinite(n) ? n : 0) + 1;
      localStorage.setItem('aura_refund_pending', String(next));
    } catch (e) { /* ignore */ }

    window.AuraDashboard?.refreshRefundPendingLabel?.();
    if (typeof showToast === 'function') showToast('Recibo enviado — status pendente ✓');
  });
}

async function main() {
  if (window.__auraAuthReady) {
    const ok = await window.__auraAuthReady;
    if (!ok) return;
  }

  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;

  if (!url || !key) {
    initMoodLocalFallback();
    window.AuraDashboard?.setBatteryFromMoodAverage?.(null, { sampleCount: 0 });
    return;
  }

  const supabase =
    window.__auraSupabaseClient ||
    createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

  const { userId, authError } = await resolveSupabaseSession(supabase);

  if (!userId) {
    initMoodLocalFallback();
    window.AuraDashboard?.setBatteryFromMoodAverage?.(null, { sampleCount: 0 });
    if (typeof showToast === 'function' && authError) {
      showToast('Sessão não encontrada. Entra de novo em login.html.');
    }
    return;
  }

  const p = typeof AuraAuth !== 'undefined' ? AuraAuth.getProfile() : {};
  if (p.nomeCompleto || p.email) {
    await supabase.from('profiles').upsert(
      {
        id: userId,
        ...(p.email ? { email: p.email } : {}),
        ...(p.nomeCompleto ? { full_name: p.nomeCompleto } : {}),
      },
      { onConflict: 'id' }
    );
  }
  await hydrateDashboardContext(supabase, userId);

  const { avg, count, lastSlug } = await fetchSevenDayMoodAverage(supabase, userId);
  window.AuraDashboard?.setBatteryFromMoodAverage?.(avg, { sampleCount: count });

  if (lastSlug && MOOD_SCORE_BY_SLUG[lastSlug] != null) setActiveMoodButton(lastSlug);
  else setActiveMoodButton('ok');

  initMoodWithSupabase(supabase, userId);
  await initRefundAssistant(supabase, userId);
}

main().catch((e) => {
  console.warn('[Aura] dashboard-supabase:', e);
  initMoodLocalFallback();
  window.AuraDashboard?.setBatteryFromMoodAverage?.(null, { sampleCount: 0 });
});
