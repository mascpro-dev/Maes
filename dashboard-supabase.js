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

/**
 * Sempre auth.users.id — exigido pelas políticas RLS (auth.uid() = user_id).
 * Ative "Anonymous sign-ins" em Supabase → Authentication → Providers.
 */
async function resolveSupabaseSession(supabase) {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && typeof supabase.auth.signInAnonymously === 'function') {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('[Aura] signInAnonymously:', error.message);
      return { userId: null, session: null, authError: error };
    }
    if (data?.session) session = data.session;
  }

  const uid = session?.user?.id;
  return { userId: uid || null, session, authError: null };
}

/** Lê profiles no Supabase e sincroniza localStorage + topbar */
async function hydrateProfileFromSupabase(supabase, userId) {
  if (typeof AuraAuth === 'undefined') return;
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return;

  const patch = {};
  if (data.full_name) patch.nomeCompleto = data.full_name;
  if (data.email) patch.email = data.email;

  if (Object.keys(patch).length) {
    AuraAuth.saveProfile(patch);
    AuraAuth.applyProfileToUI?.();
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
              ? 'Sessão Supabase inválida. Ative login anónimo ou use utilizador com Auth.'
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
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;

  if (!url || !key) {
    initMoodLocalFallback();
    window.AuraDashboard?.setBatteryFromMoodAverage?.(null, { sampleCount: 0 });
    return;
  }

  const supabase = createClient(url, key);
  const { userId, authError } = await resolveSupabaseSession(supabase);

  if (!userId) {
    initMoodLocalFallback();
    window.AuraDashboard?.setBatteryFromMoodAverage?.(null, { sampleCount: 0 });
    if (typeof showToast === 'function' && authError) {
      showToast(
        'Supabase: ative "Anonymous sign-ins" (Auth → Providers) para gravar humor, ou inicie sessão com e-mail.'
      );
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
  await hydrateProfileFromSupabase(supabase, userId);

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
