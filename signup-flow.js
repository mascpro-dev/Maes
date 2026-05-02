/**
 * Cadastro em 3 passos — Supabase (profiles, children, support_network).
 * Ajuste SIGNUP_SCHEMA se as tuas colunas no painel forem diferentes.
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

/** Bio mínima alinhada com Explorar / perfil (rede de apoio). */
export const SIGNUP_MIN_BIO_LENGTH = 20;

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

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

function extFromAvatarFile(file) {
  const t = (file.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  return 'jpg';
}

function validateAvatarFileForSignup(file) {
  const t = (file.type || '').toLowerCase();
  const ok = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(t);
  if (!ok) return { ok: false, message: 'Formato inválido. Usa JPG, PNG, WebP ou GIF.' };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, message: 'A imagem deve ter no máximo 5 MB.' };
  return { ok: true };
}

/**
 * Valida cidade, UF, bio e ficheiro de avatar antes de concluir o cadastro (passo 3).
 * @returns {{ ok: true, cidade: string, estado: string, bio: string } | { ok: false, message: string }}
 */
export function validateSignupProfileFields({ cidade, estado, bio, avatarFile }) {
  const c = String(cidade ?? '').trim();
  if (c.length < 2) return { ok: false, message: 'Indica a cidade.' };

  const e = String(estado ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2);
  if (e.length !== 2) {
    return { ok: false, message: 'Indica o estado com 2 letras (UF), ex.: SP.' };
  }

  const b = String(bio ?? '').trim();
  if (b.length < SIGNUP_MIN_BIO_LENGTH) {
    return {
      ok: false,
      message: `Escreve uma bio com pelo menos ${SIGNUP_MIN_BIO_LENGTH} caracteres (para te apresentares na comunidade).`,
    };
  }

  if (!avatarFile || !(avatarFile instanceof Blob)) {
    return { ok: false, message: 'Escolhe uma foto de perfil.' };
  }

  const av = validateAvatarFileForSignup(avatarFile);
  if (!av.ok) return av;

  return { ok: true, cidade: c, estado: e, bio: b };
}

/**
 * Storage público `avatars` → URL (sem gravar em profiles; uso em completeSignupStep3).
 */
export async function uploadSignupAvatarToStorage(client, userId, file) {
  const av = validateAvatarFileForSignup(file);
  if (!av.ok) return { ok: false, message: av.message };

  const ext = extFromAvatarFile(file);
  const path = `${userId}/avatar.${ext}`;
  const { error: upErr } = await client.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: '86400',
    contentType: file.type || 'image/jpeg',
  });

  if (upErr) {
    const m = String(upErr.message || '');
    if (/bucket|not found|404/i.test(m)) {
      return {
        ok: false,
        message:
          'Bucket de fotos em falta. No Supabase, corre o SQL em supabase/COLE_STORAGE_AVATARS.sql (bucket avatars).',
      };
    }
    if (/row-level security|RLS|policy|403|permission/i.test(m)) {
      return {
        ok: false,
        message: 'Sem permissão para enviar a foto. Verifica as políticas do bucket avatars no Supabase.',
      };
    }
    return { ok: false, message: 'Não foi possível enviar a foto: ' + m };
  }

  const { data: pub } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const base = pub?.publicUrl;
  if (!base) return { ok: false, message: 'Upload ok mas falhou o URL público da foto.' };

  const avatar_url = `${base.split('?')[0]}?v=${Date.now()}`;
  return { ok: true, avatar_url };
}

/**
 * Passo 1: Auth + perfil da mãe.
 * Requer confirmação de e-mail desativada (Auth → Providers → Email) ou sessão imediata após signUp.
 */
export async function signupStep1Mother({ fullName, email, phone, password }) {
  const { client, error } = getSignupClient();
  if (error) return { ok: false, message: error };

  const phoneTrim = (phone || "").trim();
  const phoneDigits = phoneTrim.replace(/\D/g, "");
  if (phoneDigits.length < 10) {
    return {
      ok: false,
      message: "Indica um telemóvel válido com DDD (mínimo 10 dígitos).",
    };
  }

  const { data, error: signErr } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        phone: phoneTrim,
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

  let referredBy = null;
  try {
    const refCode =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('aura_signup_ref_code') : null;
    const trimmed = refCode ? String(refCode).trim() : '';
    if (trimmed) {
      const { data: refUid, error: refErr } = await client.rpc('referrer_user_id_from_referral_code', {
        p_code: trimmed,
      });
      if (!refErr && refUid && refUid !== user.id) {
        referredBy = refUid;
      }
    }
  } catch (_) {
    /* RPC em falta ou rede: cadastro continua sem referred_by */
  }

  const P = SIGNUP_SCHEMA.profiles;
  const row = {
    id: user.id,
    email: email.trim(),
    [P.fullName]: fullName.trim(),
    [P.phone]: phoneTrim || null,
    [P.termsAt]: new Date().toISOString(),
    ...(referredBy ? { referred_by: referredBy } : {}),
  };

  const { error: upErr } = await client.from(P.table).upsert(row, { onConflict: 'id' });
  if (upErr) return { ok: false, message: upErr.message };

  if (referredBy) {
    try {
      sessionStorage.removeItem('aura_signup_ref_code');
    } catch (_) {
      /* ignore */
    }
  }

  if (typeof window.AuraAuth !== 'undefined') {
    window.AuraAuth.saveProfile({
      nomeCompleto: fullName.trim(),
      email: email.trim(),
      phone: phoneTrim,
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

  const dx0 = Array.isArray(diagnosticos) && diagnosticos.length ? String(diagnosticos[0]).trim() : "";
  if (dx0) {
    const P = SIGNUP_SCHEMA.profiles;
    const { error: dxErr } = await client.from(P.table).update({ diagnostico: dx0 }).eq("id", userId);
    if (dxErr) console.warn("[signup] profiles.diagnostico:", dxErr.message);
  }

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
 * Passo 3: cidade, UF, bio, foto + desafios → profiles + support_network.
 */
export async function completeSignupStep3({ challengeSlugs, cidade, estado, bio, avatarFile }) {
  const v = validateSignupProfileFields({ cidade, estado, bio, avatarFile });
  if (!v.ok) return v;

  const { client, error } = getSignupClient();
  if (error) return { ok: false, message: error };

  const userId = await getSessionUserId(client);
  if (!userId) {
    return { ok: false, message: 'Sessão expirada. Entra de novo em login.html.' };
  }

  const up = await uploadSignupAvatarToStorage(client, userId, avatarFile);
  if (!up.ok) return up;

  const arr = Array.isArray(challengeSlugs) ? challengeSlugs : [];
  if (!arr.length) {
    return { ok: false, message: 'Escolhe pelo menos um desafio para personalizarmos a experiência.' };
  }

  const P = SIGNUP_SCHEMA.profiles;

  const { error: pErr } = await client
    .from(P.table)
    .update({
      cidade: v.cidade,
      estado: v.estado,
      bio: v.bio,
      avatar_url: up.avatar_url,
      [P.onboardingChallenges]: arr,
    })
    .eq('id', userId);

  if (pErr) {
    const msg = pErr.message || '';
    return {
      ok: false,
      message:
        msg.includes('column') || pErr.code === '42703'
          ? 'Faltam colunas no perfil (cidade, estado, bio ou avatar_url). Corre os SQL em supabase (profiles).'
          : `profiles: ${msg}`,
    };
  }

  const SN = SIGNUP_SCHEMA.supportNetwork;
  const snRow = { [SN.userId]: userId, [SN.challenges]: arr };
  const { error: snErr } = await client.from(SN.table).upsert(snRow, { onConflict: SN.userId });
  if (snErr) {
    console.warn('[Aura] support_network:', snErr.message, '(ajusta SIGNUP_SCHEMA ou executa supabase/COLE_CADASTRO_3_PASSOS.sql)');
  }

  if (typeof window.AuraAuth !== 'undefined') {
    window.AuraAuth.saveProfile({
      cidade: v.cidade,
      estado: v.estado,
      bio: v.bio,
      avatarUrl: up.avatar_url,
      onboardingChallenges: arr,
    });
    window.AuraAuth.setLoggedIn(true);
  }

  return { ok: true };
}
