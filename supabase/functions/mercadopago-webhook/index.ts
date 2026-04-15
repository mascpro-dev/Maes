/**
 * Webhook Mercado Pago — confirma pagamento e cria consultation_bookings.
 * Secret MERCADOPAGO_ACCESS_TOKEN (mesmo do checkout) para GET /v1/payments/:id
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const accessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!accessToken || !supabaseUrl || !serviceKey) {
    return new Response('misconfigured', { status: 503, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let payload: { type?: string; topic?: string; action?: string; data?: { id?: string }; resource?: string };
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return new Response('bad json', { status: 400, headers: corsHeaders });
  }

  let paymentId: string | undefined;
  if (payload.type === 'payment' && payload.data?.id) {
    paymentId = String(payload.data.id);
  } else if (payload.topic === 'payment' && (payload as { id?: string }).id) {
    paymentId = String((payload as { id: string }).id);
  }

  if (!paymentId && payload.topic === 'payment' && typeof payload.resource === 'string') {
    const r = payload.resource.trim();
    if (r.includes('/')) {
      const parts = r.split('/');
      paymentId = parts[parts.length - 1];
    } else if (/^\d+$/.test(r)) {
      paymentId = r;
    }
  }

  if (!paymentId) {
    return new Response('ignored', { status: 200, headers: corsHeaders });
  }

  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const pay = await payRes.json().catch(() => null);
  if (!payRes.ok || !pay) {
    console.error('[mp-webhook] fetch payment', payRes.status, pay);
    return new Response('payment_fetch_failed', { status: 502, headers: corsHeaders });
  }

  const status = String(pay.status || '');
  const extRef = pay.external_reference ? String(pay.external_reference).trim() : '';
  const amount = Number(pay.transaction_amount);

  if (!extRef || extRef.length < 32) {
    return new Response('no_external_ref', { status: 200, headers: corsHeaders });
  }

  if (status !== 'approved' && status !== 'authorized') {
    return new Response('not_approved', { status: 200, headers: corsHeaders });
  }

  if (!Number.isFinite(amount) || amount < 49.89) {
    console.warn('[mp-webhook] amount mismatch', amount);
    return new Response('amount_mismatch', { status: 200, headers: corsHeaders });
  }

  const { data, error } = await admin.rpc('finalize_consultation_checkout_intent', {
    p_intent_id: extRef,
    p_mp_payment_id: paymentId,
  });

  if (error) {
    console.error('[mp-webhook] finalize', error);
    if (String(error.message || '').includes('slot_taken')) {
      return new Response('slot_taken', { status: 200, headers: corsHeaders });
    }
    return new Response('finalize_failed', { status: 500, headers: corsHeaders });
  }

  console.log('[mp-webhook] ok', paymentId, data);
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
