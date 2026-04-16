/**
 * Cria preferência Checkout Pro (Pix + cartão crédito 1x) e regista intenção de consulta.
 * Secrets: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY (+ URL já injectadas pelo Supabase)
 * Opcional: APP_PUBLIC_URL (https://teudominio.com) para back_urls se Origin falhar
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || req.headers.get('origin');
  const allow = origin && origin.startsWith('http') ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-public-site-url',
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

/** URLs de retorno: secret APP_PUBLIC_URL, cabeçalho X-Public-Site-Url (app), Origin ou Referer */
function publicBaseUrl(req: Request): string {
  const env = Deno.env.get('APP_PUBLIC_URL')?.trim().replace(/\/$/, '');
  if (env) return env;

  const fromHeader = req.headers.get('X-Public-Site-Url')?.trim().replace(/\/$/, '');
  if (fromHeader && /^https:\/\/.+/i.test(fromHeader)) {
    return fromHeader;
  }

  const origin = req.headers.get('Origin') || req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      /* ignore */
    }
  }

  const referer = req.headers.get('Referer') || req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }

  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(req) });
  }

  if (req.method !== 'POST') {
    return json(req, 405, { error: 'method_not_allowed' });
  }

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();

  if (!accessToken || !supabaseUrl || !serviceKey) {
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
    specialist_id?: string;
    starts_at?: string;
    payment_method?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'invalid_json' });
  }

  const specialistId = body.specialist_id?.trim();
  const startsAt = body.starts_at?.trim();
  const paymentMethod = body.payment_method?.trim();

  if (!specialistId || !startsAt) {
    return json(req, 400, { error: 'missing_fields' });
  }
  if (paymentMethod !== 'pix' && paymentMethod !== 'credit_card') {
    return json(req, 400, { error: 'invalid_payment_method' });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let payerEmail = user.email?.trim() || '';
  if (!payerEmail) {
    const { data: authData, error: authLookupErr } = await admin.auth.admin.getUserById(user.id);
    if (!authLookupErr) {
      payerEmail = authData?.user?.email?.trim() || '';
    }
  }
  if (!payerEmail) {
    payerEmail = `comprador+${user.id.replace(/-/g, '').slice(0, 12)}@mercadopago.com.br`;
  }

  const { data: intent, error: insErr } = await admin
    .from('consultation_checkout_intents')
    .insert({
      mother_id: user.id,
      specialist_id: specialistId,
      starts_at: startsAt,
      payment_method: paymentMethod,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insErr || !intent?.id) {
    console.error('[mp-preference] insert intent', insErr);
    return json(req, 500, {
      error: 'intent_create_failed',
      detail: insErr?.message || String(insErr),
      hint:
        'Confirma que a migração 20260410190000 foi aplicada e que existe linha em profiles com o mesmo id do login.',
    });
  }

  const intentId = intent.id as string;
  const base = publicBaseUrl(req);
  if (!base) {
    await admin.from('consultation_checkout_intents').update({ status: 'failed' }).eq('id', intentId);
    return json(req, 503, {
      error: 'missing_app_public_url_or_origin',
      detail:
        'Define o secret APP_PUBLIC_URL (ex.: https://maes-pi.vercel.app) ou envia o cabeçalho X-Public-Site-Url a partir da app.',
    });
  }

  const successUrl = `${base}/especialistas.html?mp=success&intent=${encodeURIComponent(intentId)}`;
  const failureUrl = `${base}/especialistas.html?mp=failure`;
  const pendingUrl = `${base}/especialistas.html?mp=pending&intent=${encodeURIComponent(intentId)}`;
  const fnBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
  const notificationUrl = `${fnBase}/mercadopago-webhook`;

  const preferenceBody = {
    items: [
      {
        id: 'consulta-social-conta-mae',
        title: 'Consulta social — Conta Mãe (especialista)',
        description: `Consulta credenciada · ref. ${intentId.slice(0, 8)}`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: 49.9,
      },
    ],
    payer: { email: payerEmail },
    external_reference: intentId,
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    auto_return: 'approved',
    notification_url: notificationUrl,
    payment_methods: {
      installments: 1,
      default_installments: 1,
      excluded_payment_types: [{ id: 'debit_card' }, { id: 'ticket' }],
    },
    statement_descriptor: 'CONTAMAE',
    binary_mode: false,
  };

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': intentId,
    },
    body: JSON.stringify(preferenceBody),
  });

  const mpJson = await mpRes.json().catch(() => ({}));
  if (!mpRes.ok) {
    console.error('[mp-preference] MP error', mpRes.status, mpJson);
    await admin.from('consultation_checkout_intents').update({ status: 'failed' }).eq('id', intentId);
    return json(req, 502, { error: 'mercadopago_error', status: mpRes.status, detail: mpJson });
  }

  const prefId = mpJson.id as string | undefined;
  if (prefId) {
    await admin
      .from('consultation_checkout_intents')
      .update({ mp_preference_id: prefId })
      .eq('id', intentId);
  }

  const initPoint = (mpJson.init_point as string) || (mpJson.sandbox_init_point as string);
  if (!initPoint) {
    await admin.from('consultation_checkout_intents').update({ status: 'failed' }).eq('id', intentId);
    return json(req, 502, { error: 'no_init_point', detail: mpJson });
  }

  return json(req, 200, {
    init_point: initPoint,
    intent_id: intentId,
    preference_id: prefId ?? null,
  });
});
