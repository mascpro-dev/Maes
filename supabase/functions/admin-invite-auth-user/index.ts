/**
 * Admin: convite Auth por e-mail (parceiros sem signup na app).
 *
 * — Sem RESEND_API_KEY: usa `inviteUserByEmail` (depende do SMTP / e-mail por defeito do Supabase —
 *   muitas vezes não chega ou cai em spam).
 * — Com RESEND_API_KEY (+ RESEND_FROM opcional): gera link com `generateLink({ type: 'invite' })`
 *   e envia o convite pelo Resend (recomendado).
 * user_metadata `invite_role: medic` → trigger handle_new_user grava profiles.account_type = medic
 * (evita redirecionar o profissional para o cadastro da mãe em login.html).
 *
 * Secrets: SUPABASE_*, e opcionalmente RESEND_API_KEY, RESEND_FROM (ex. "Conta Mãe <noreply@teudominio.com>")
 *
 * Deploy:
 *   npx supabase functions deploy admin-invite-auth-user --project-ref SEU_REF --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || req.headers.get('origin');
  const allow = origin && origin.startsWith('http') ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(req: Request, status: number, body: unknown) {
  const h = corsHeadersFor(req);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...h, 'Content-Type': 'application/json' },
  });
}

function normalizeEmail(raw: unknown): string {
  if (raw == null || typeof raw !== 'string') return '';
  let s = raw.trim();
  if (/^mailto:/i.test(s)) s = s.slice(7).trim();
  s = s.split('?')[0].split('#')[0].trim();
  return s;
}

async function sendResendInvite(
  resendKey: string,
  resendFrom: string,
  to: string,
  actionLink: string,
): Promise<{ ok: boolean; detail?: string }> {
  const html = `
  <p>Olá,</p>
  <p>Recebeste um convite para criar ou ativar o teu acesso na app <strong>Conta Mãe</strong>.</p>
  <p><a href="${actionLink}" style="word-break:break-all">Clica aqui para concluir o registo</a></p>
  <p>Este link expira pelo tempo definido pelo sistema de autenticação. Se não pediste este convite, ignora esta mensagem.</p>
  `.trim();
  const text = [
    'Recebeste um convite para aceder à Conta Mãe.',
    '',
    `Abre esta ligação no browser para concluir o registo (válida por tempo limitado):`,
    actionLink,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [to],
      subject: '[Conta Mãe] Convite para criares acesso na app',
      html,
      text,
    }),
  });
  const resText = await res.text();
  if (!res.ok) {
    console.error('[admin-invite-auth-user] Resend:', res.status, resText);
    return { ok: false, detail: resText.slice(0, 500) };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }
  if (req.method !== 'POST') {
    return json(req, 405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (!supabaseUrl || !serviceKey) {
    return json(req, 503, { error: 'server_misconfigured' });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return json(req, 401, { error: 'missing_authorization' });
  }

  const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(jwt);
  if (userErr || !user?.id) {
    return json(req, 401, { error: 'invalid_session' });
  }

  const service = createClient(supabaseUrl, serviceKey);
  const { data: adm, error: admErr } = await service
    .from('aura_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (admErr || !adm) {
    return json(req, 403, { error: 'forbidden' });
  }

  let body: { email?: string; redirect_to?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'invalid_json' });
  }

  const email = normalizeEmail(body.email ?? '');
  if (!email.includes('@') || email.length > 254) {
    return json(req, 400, { error: 'invalid_email' });
  }

  const redirectRaw = body.redirect_to?.trim();
  const redirectTo =
    redirectRaw && /^https:\/\//i.test(redirectRaw) ? redirectRaw : undefined;

  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const resendFrom =
    Deno.env.get('RESEND_FROM')?.trim() ||
    Deno.env.get('RESEND_FROM_INVITE')?.trim() ||
    'CONTA MÃE <onboarding@resend.dev>';

  const inviteMeta = { invite_role: 'medic' as const };

  if (resendKey) {
    const { data: linkData, error: genErr } = await service.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        ...(redirectTo ? { redirectTo } : {}),
        data: inviteMeta,
      },
    });
    if (genErr) {
      const detail = genErr.message || String(genErr);
      if (/already (been )?registered|already exists|User already/i.test(detail)) {
        return json(req, 200, {
          ok: true,
          already_exists: true,
          message: detail,
        });
      }
      return json(req, 400, { error: 'generate_link_failed', detail: detail.slice(0, 400) });
    }
    const actionLink =
      (linkData as { properties?: { action_link?: string } })?.properties?.action_link ||
      '';
    if (!actionLink) {
      return json(req, 502, { error: 'missing_action_link' });
    }
    const sent = await sendResendInvite(resendKey, resendFrom, email, actionLink);
    if (!sent.ok) {
      return json(req, 502, {
        error: 'resend_failed',
        detail: sent.detail || 'resend_failed',
      });
    }
    const uid = (linkData as { user?: { id?: string } })?.user?.id ?? null;
    return json(req, 200, {
      ok: true,
      already_exists: false,
      user_id: uid,
      delivered_via: 'resend',
    });
  }

  const { data: inviteData, error: invErr } = await service.auth.admin.inviteUserByEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
    data: inviteMeta,
  });

  if (invErr) {
    const detail = invErr.message || String(invErr);
    if (/already (been )?registered|already exists|User already/i.test(detail)) {
      return json(req, 200, {
        ok: true,
        already_exists: true,
        message: detail,
      });
    }
    return json(req, 400, { error: 'invite_failed', detail: detail.slice(0, 400) });
  }

  return json(req, 200, {
    ok: true,
    already_exists: false,
    user_id: inviteData?.user?.id ?? null,
    delivered_via: 'supabase',
  });
});
