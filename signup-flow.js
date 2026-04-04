/**
 * Cadastro em 3 passos — Supabase (profiles, children, support_network).
 * Ajuste SIGNUP_SCHEMA se as tuas colunas no painel forem diferentes.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

export const SIGNUP_SCHEMA = {
  profiles: {
    table: 'profiles',
    fullName: 'full_name',
    email: 'email',
    phone: 'phone',
    termsAt: 'terms_accepted_at',
    onboardingChallenges: 'onboarding_challenges',
  },
  children: {
    table: 'children',
    userId: 'user_id',
    nome: 'nome',
    birth: 'data_nascimento',
    diagnosticos: 'diagnosticos',
  },
  supportNetwork: {
    table: 'support_network',
    userId: 'user_id',
    challenges: 'challenge_areas',
  },
};

export function getSignupClient() {
  const url = window.AURA_SUPABASE_URL;
  const key = window.AURA_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { client: null, error: 'Configura URL e chave anónima em supabase-config.js (e .env.local no servidor).' };
  }
  return { client: createClient(url, key), error: null };
}

export async function getSessionUserId(client) {
  const {
    data: { session },
  } = await client.auth.getSession();
  return session?.user?.id || null;
}

/**
 * Passo 1: Auth + perfil da mãe.
 * Requer confirmação de e-mail desativada (Auth → Providers → Email) ou sessão imediata após signUp.
 */
export async function signupStep1Mother({ fullName, email, phone, password }) {
  const { client, error } = getSignupClient();
  if (error) return { ok: false, message: error };

  const { data, error: signErr } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        phone: (phone || '').trim(),
      },
    },
  });

  if (signErr) return { ok: false, message: signErr.message };

  const user = data.user;
  if (!user?.id) {
    return {
      ok: false,
      message:
        'Não foi possível obter o utilizador. Se o projeto exige confirmação de e-mail, desativa temporariamente em Authentication → Providers → Email, ou confirma o e-mail e inicia sessão antes do passo 2.',
    };
  }

  if (!data.session) {
    return {
      ok: false,
      message:
        'Sessão não iniciada após o registo. No Supabase: Authentication → Providers → Email → desativa "Confirm email" (ambiente de testes) ou confirma o e-mail e volta a entrar.',
    };
  }

  const P = SIGNUP_SCHEMA.profiles;
  const row = {
    id: user.id,
    email: email.trim(),
    [P.fullName]: fullName.trim(),
    [P.phone]: (phone || '').trim() || null,
    [P.termsAt]: new Date().toISOString(),
  };

  const { error: upErr } = await client.from(P.table).upsert(row, { onConflict: 'id' });
  if (upErr) return { ok: false, message: upErr.message };

  if (typeof window.AuraAuth !== 'undefined') {
    window.AuraAuth.saveProfile({
      nomeCompleto: fullName.trim(),
      email: email.trim(),
      phone: (phone || '').trim(),
      termsAcceptedAt: row[P.termsAt],
    });
    window.AuraAuth.setLoggedIn(true);
  }

  return { ok: true, userId: user.id };
}

/**
 * Passo 2: uma criança (podes duplicar o insert no futuro para várias).
 */
export async function signupStep2Child({ nome, dataNascimento, diagnosticos }) {
  const { client, error } = getSignupClient();
  if (error) return { ok: false, message: error };

  const userId = await getSessionUserId(client);
  if (!userId) {
    return { ok: false, message: 'Sessão expirada. Entra de novo em login.html.' };
  }

  const C = SIGNUP_SCHEMA.children;
  const payload = {
    [C.userId]: userId,
    [C.nome]: nome.trim(),
    [C.birth]: dataNascimento || null,
    [C.diagnosticos]: Array.isArray(diagnosticos) ? diagnosticos : [],
  };

  const { error: insErr } = await client.from(C.table).insert(payload);
  if (insErr) return { ok: false, message: insErr.message };

  if (typeof window.AuraAuth !== 'undefined') {
    window.AuraAuth.saveProfile({
      nomeCrianca: nome.trim(),
      diagnostico: diagnosticos[0] || null,
      diagnosticos,
    });
  }

  return { ok: true };
}

/**
 * Passo 3: desafios → profiles + support_network (tenta colunas alternativas).
 */
export async function signupStep3Challenges(challengeSlugs) {
  const { client, error } = getSignupClient();
  if (error) return { ok: false, message: error };

  const userId = await getSessionUserId(client);
  if (!userId) {
    return { ok: false, message: 'Sessão expirada. Entra de novo em login.html.' };
  }

  const arr = Array.isArray(challengeSlugs) ? challengeSlugs : [];
  const P = SIGNUP_SCHEMA.profiles;

  const { error: pErr } = await client
    .from(P.table)
    .update({ [P.onboardingChallenges]: arr })
    .eq('id', userId);

  if (pErr) return { ok: false, message: `profiles: ${pErr.message}` };

  const SN = SIGNUP_SCHEMA.supportNetwork;
  const snRow = { [SN.userId]: userId, [SN.challenges]: arr };
  const { error: snErr } = await client.from(SN.table).upsert(snRow, { onConflict: SN.userId });
  if (snErr) {
    console.warn('[Aura] support_network:', snErr.message, '(ajusta SIGNUP_SCHEMA ou executa supabase/COLE_CADASTRO_3_PASSOS.sql)');
  }

  if (typeof window.AuraAuth !== 'undefined') {
    window.AuraAuth.saveProfile({ onboardingChallenges: arr });
    window.AuraAuth.setLoggedIn(true);
  }

  return { ok: true };
}
