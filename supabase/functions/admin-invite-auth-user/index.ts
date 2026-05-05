/**
 * Admin: criar entrada em Authentication por convite ao e-mail (parceiros aprovados sem signup).
 *
 * Segurança: valida Bearer JWT da sessão e confirma `aura_admins` via service_role.
 *
 * Secrets (automáticas no Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * Em Auth → URL Configuration, permite o mesmo domínio passado em `redirect_to` (ex. login).
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

  const { data: inviteData, error: invErr } = await service.auth.admin.inviteUserByEmail(email, {
    ...(redirectTo ? { redirectTo } : {}),
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
  });
});
