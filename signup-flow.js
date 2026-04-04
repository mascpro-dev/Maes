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
    /** Coluna na BD: muitos projetos Supabase usam `name`; enviar `nome` deixava `name` NULL. */
    nome: 'name',
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

/**
 * Mensagens do Supabase Auth em inglês → português + limite de pedidos (PC vs telemóvel).
 */
export function humanizeAuthError(message) {
  const msg = String(message || '').trim();
  if (!msg) return 'Não foi possível concluir o registo. Tenta de novo.';

  const afterSec = msg.match(/after\s+(\d+)\s*seconds?/i);
  if (afterSec) {
    const s = afterSec[1];
    return (
      `Por segurança, o Supabase só aceita um novo registo ou envio de e-mail daqui a ${s} segundos.\n\n` +
      `Aguarda o tempo indicado (não cliques várias vezes em "Continuar") e tenta outra vez. ` +
      `No telemóvel o bloqueio é o mesmo se repetires o passo.`
    );
  }

  if (/rate limit|too many requests|security purposes/i.test(msg)) {
    return (
      'Muitas tentativas seguidas. Aguarda cerca de um minuto antes de registar de novo.\n\n' +
      'Evita carregar várias vezes no botão em sequência.'
    );
  }

  if (/already registered|already been registered|User already exists/i.test(msg)) {
    return 'Este e-mail já tem conta. Usa "Entrar" ou "Esqueci minha senha".';
  }

  if (/invalid email|Unable to validate email/i.test(msg)) {
    return 'O e-mail não parece válido. Verifica se está correto.';
  }

  if (/invalid login|invalid credentials|invalid password|wrong password/i.test(msg)) {
    return 'E-mail ou senha incorretos. Se acabaste de criar a conta, confirma o e-mail no Supabase ou na tua caixa de entrada.';
  }

  if (/email not confirmed|not confirmed/i.test(msg)) {
    return 'Este e-mail ainda não foi confirmado. Abre o link que enviámos ou pede um novo e-mail no painel do Supabase.';
  }

  if (/password/i.test(msg) && /short|least|characters/i.test(msg)) {
    return 'A senha não cumpre os requisitos do Supabase (comprimento ou complexidade). Tenta uma senha mais forte.';
  }

  return msg;
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

  if (signErr) return { ok: false, message: humanizeAuthError(signErr.message) };

  const user = data.user;
  if (!user?.id) {
    return {
      ok: false,
      message:
        'Não foi possível criar a conta neste momento. Se usas confirmação de e-mail, verifica a caixa de entrada ou as definições do Supabase (Email → Confirm email).',
    };
  }

  if (!data.session) {
    return {
      ok: false,
      code: 'EMAIL_CONFIRM',
      message:
        'A conta foi criada, mas não há sessão automática — isto é normal quando a confirmação de e-mail está ligada no Supabase (comum no telemóvel).\n\n' +
        'Para testar o cadastro em 3 passos sem interrupção:\n' +
        '• Painel Supabase → Authentication → Providers → Email → desliga "Confirm email" (só em desenvolvimento).\n\n' +
        'Em produção com confirmação ligada:\n' +
        '• Abre o e-mail, confirma o link, depois entra em login.html com o mesmo e-mail e senha. ' +
        'Os passos 2 e 3 do cadastro precisam de sessão iniciada.',
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
