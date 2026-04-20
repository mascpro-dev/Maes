/**
 * Notificação por e-mail quando um médico fecha ou reabre um slot na agenda.
 *
 * Secrets (Supabase Dashboard → Edge Functions → notify-calendar-slot-change):
 *   RESEND_API_KEY       — API key Resend (https://resend.com)
 *   CALENDAR_NOTIFY_TO   — e-mails destino, separados por vírgula (ex.: admin@…,equipa@…)
 * Opcional:
 *   RESEND_FROM          — remetente verificado (ex.: Aura <noreply@seudominio.com>); senão usa onboarding@resend.dev
 *
 * Publicar (na pasta do projeto):
 *   npx supabase functions deploy notify-calendar-slot-change --project-ref SEU_REF --no-verify-jwt
 *
 * A função valida o JWT com getUser(); usa --no-verify-jwt no gateway se o projeto usa ES256 no Auth.
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
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const notifyToRaw = Deno.env.get('CALENDAR_NOTIFY_TO')?.trim();
  const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'CONTA MÃE <onboarding@resend.dev>';

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

  let body: {
    action?: string;
    starts_at?: string;
    specialist_id?: string;
    specialist_display_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'invalid_json' });
  }

  const action = body.action?.trim();
  const startsAt = body.starts_at?.trim();
  const specialistId = body.specialist_id?.trim();
  const labelExtra = (body.specialist_display_name || '').trim();

  if (action !== 'block' && action !== 'unblock') {
    return json(req, 400, { error: 'invalid_action' });
  }
  if (!startsAt || !specialistId) {
    return json(req, 400, { error: 'missing_fields' });
  }

  const { data: mySid, error: sidErr } = await userClient.rpc('my_specialist_id');
  if (sidErr || !mySid || String(mySid) !== specialistId) {
    return json(req, 403, { error: 'not_linked_specialist' });
  }

  if (!resendKey || !notifyToRaw) {
    return json(req, 200, { ok: true, notified: false, reason: 'email_not_configured' });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  let displayName = labelExtra;
  if (!displayName) {
    const { data: row } = await admin.from('specialists').select('display_name').eq('id', specialistId).maybeSingle();
    displayName = (row?.display_name as string)?.trim() || specialistId.slice(0, 8);
  }

  const verb = action === 'block' ? 'fechou' : 'reabriu';
  const subject = `[CONTA MÃE] Agenda: ${displayName} ${verb} um horário`;
  const when = (() => {
    try {
      return new Date(startsAt).toLocaleString('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
    } catch {
      return startsAt;
    }
  })();

  const text = [
    `O(A) especialista ${displayName} (${specialistId}) ${verb} um slot na agenda pública.`,
    ``,
    `Horário (UTC/ISO): ${startsAt}`,
    `Legível: ${when}`,
    ``,
    `Conta Auth: ${user.id}`,
    user.email ? `E-mail da sessão: ${user.email}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const recipients = notifyToRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));

  if (!recipients.length) {
    return json(req, 200, { ok: true, notified: false, reason: 'no_valid_recipients' });
  }

  const SUPPORT_BCC = 'suporte.contamae@gmail.com';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendFrom,
      to: recipients,
      bcc: [SUPPORT_BCC],
      subject,
      text,
    }),
  });

  const resText = await res.text();
  if (!res.ok) {
    console.error('[notify-calendar-slot-change] Resend:', res.status, resText);
    return json(req, 502, {
      error: 'resend_failed',
      status: res.status,
      detail: resText.slice(0, 400),
    });
  }

  return json(req, 200, { ok: true, notified: true });
});
