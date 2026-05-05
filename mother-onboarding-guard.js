/**
 * Garante que contas «mãe» não navegam na app nem saltam passos sem concluir o cadastro obrigatório.
 * Perfis medic (e admin.html / especialista-agenda) ficam de fora desta gate.
 */
import { SIGNUP_MIN_BIO_LENGTH } from './signup-flow.js';

/** Páginas do fluxo de cadastro da mãe (não inclui cadastro-profissional.html). */
const MOTHER_SIGNUP_PAGES = new Set([
  'cadastro.html',
  'cadastro-passo2.html',
  'cadastro-passo3.html',
  'cadastro-escolha.html',
]);

function currentPageName() {
  const raw = typeof window !== 'undefined' ? window.location.pathname || '' : '';
  const parts = raw.split('/').filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '';
  return last || '';
}

/** Passo 1 (Auth + perfil mãe) considerado válido. */
export function isProfileMotherStep1Ready(profile) {
  if (!profile) return false;
  const phoneDigits = String(profile.phone || '').replace(/\D/g, '');
  const nameOk = String(profile.full_name || '').trim().length >= 3;
  const hasTerms = !!(profile.terms_accepted_at && String(profile.terms_accepted_at).trim());
  return hasTerms && nameOk && phoneDigits.length >= 10;
}

/** Passo 3 (explorar / rede): cidade, UF, bio, foto, desafios. */
export function isMotherSignupStep3Complete(profile) {
  if (!profile) return false;
  const bio = String(profile.bio || '').trim();
  const est = String(profile.estado || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  const cid = String(profile.cidade || '').trim();
  const av = String(profile.avatar_url || '').trim();
  const ch = Array.isArray(profile.onboarding_challenges)
    ? profile.onboarding_challenges
    : profile.onboarding_challenges
      ? [profile.onboarding_challenges]
      : [];
  return (
    cid.length >= 2 &&
    est.length === 2 &&
    bio.length >= SIGNUP_MIN_BIO_LENGTH &&
    av.length >= 8 &&
    ch.length > 0
  );
}

export async function fetchMotherSignupState(supabase, userId) {
  const [{ data: prof, error: pErr }, cntRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'account_type, terms_accepted_at, full_name, phone, cidade, estado, bio, avatar_url, onboarding_challenges',
      )
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('children')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (pErr) {
    console.warn('[onboarding]', pErr.message);
  }

  const profile = !pErr && prof ? prof : null;
  const childrenCount =
    cntRes.error || typeof cntRes.count !== 'number' ? 0 : cntRes.count;

  return { profile, childrenCount, profileError: pErr || null };
}

/**
 * Decide redireccionamento quando uma mãe ainda deve completar o cadastro (ou já não deve estar numa página de signup).
 * @param {{ allowSignupPageAccess?: boolean }} [options]
 * @returns {null|string} novo ficheiro (ex.: cadastro-passo3.html) ou index.html quando aplicável.
 */
export async function computeMotherSignupRedirect(supabase, userId, currentFileOpt, options = {}) {
  const cur = currentFileOpt || currentPageName();
  const allowSignupPageAccess = options.allowSignupPageAccess === true;
  const isMotherSignupPage = MOTHER_SIGNUP_PAGES.has(cur);
  const state = await fetchMotherSignupState(supabase, userId);
  const { profile, childrenCount, profileError } = state;

  // Compatibilidade: se o schema ainda não tem todas as colunas (ex.: terms_accepted_at),
  // não bloquear login/app para não prender em loop.
  if (profileError) {
    if (isMotherSignupPage && !allowSignupPageAccess) return 'index.html';
    return null;
  }

  const isMedicOrOther = profile?.account_type === 'medic';
  if (isMedicOrOther) {
    if (isMotherSignupPage && !allowSignupPageAccess) return 'index.html';
    return null;
  }

  // Perfis antigos (pré-cadastro 3 passos) podem não ter terms_accepted_at.
  // Mantemos acesso para não bloquear contas históricas.
  const isLegacyMother = !!(profile && !profile.terms_accepted_at);
  if (isLegacyMother) {
    if (isMotherSignupPage && !allowSignupPageAccess) return 'index.html';
    return null;
  }

  const step1 = isProfileMotherStep1Ready(profile);
  const step2 = childrenCount > 0;
  const step3 = isMotherSignupStep3Complete(profile);
  const full = step1 && step2 && step3;

  if (full) {
    if (isMotherSignupPage && !allowSignupPageAccess) return 'index.html';
    return null;
  }

  let target = null;
  if (!step1) target = 'cadastro.html';
  else if (!step2) target = 'cadastro-passo2.html';
  else if (!step3) target = 'cadastro-passo3.html';

  if (!target || target === cur) return null;
  return target;
}

/** Páginas da app onde bloqueamos acesso incompleto. */
export function shouldMotherGateCurrentPath(pathnameOpt) {
  const raw =
    pathnameOpt ??
    (typeof window !== 'undefined' ? window.location.pathname || '' : '');
  const name = raw.split('/').filter(Boolean).pop() || '';

  const skipMotherGate = ['admin.html', 'especialista-agenda.html', 'offline.html'];

  const isCadastroMotherFlow =
    name === 'cadastro.html' ||
    name === 'cadastro-passo2.html' ||
    name === 'cadastro-passo3.html' ||
    name === 'cadastro-escolha.html';

  const isCadastroProfessional = name === 'cadastro-profissional.html';

  const isAuthPublic =
    ['login.html', 'esqueci-senha.html', 'nova-senha.html', 'verificar-codigo.html'].includes(name);

  if (skipMotherGate.includes(name)) return false;
  if (isCadastroMotherFlow || isCadastroProfessional) return false;
  if (isAuthPublic) return false;
  /* Raiz típico em dev */
  return true;
}

/**
 * Chamado pelo auth-session-guard após sessão válida: força próximo passo se a conta mãe estiver incompleta.
 */
export async function enforceMotherSignupForAppPages(supabase, userId) {
  const name = currentPageName();
  if (!shouldMotherGateCurrentPath()) return null;

  const next = await computeMotherSignupRedirect(supabase, userId, name);
  if (!next || next === name) return null;

  window.location.replace(next);
  return next;
}
