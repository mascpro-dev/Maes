/**
 * Webhook Mercado Pago — confirma pagamento e cria consultation_bookings.
 * - Pix (Orders): notificação `type: order` → GET /v1/orders/:id (configurar evento Order no painel MP).
 * - Cartão (Checkout Pro): notificação `payment` → GET /v1/payments/:id
 * Secret MERCADOPAGO_ACCESS_TOKEN para chamadas à API do MP.
 *
 * E-mail ao médico (opcional): após criar a reserva, envia para specialist_private_routes.notify_email
 * se existir RESEND_API_KEY (mesma chave que outras funções Resend). Ver COLE_EMAIL_MEDICO_NOVA_CONSULTA.txt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendSpecialistBookingEmail(opts: {
  resendKey: string;
  from: string;
  to: string;
  specialistName: string;
  startsAtIso: string;
  roomSlug: string;
}) {
  const when = (() => {
    try {
      return new Date(opts.startsAtIso).toLocaleString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return opts.startsAtIso;
    }
  })();
  const subject = `[CONTA MÃE] Nova consulta agendada — ${opts.specialistName}`;
  const text = [
    `Olá, ${opts.specialistName}.`,
    ``,
    `Tens uma nova consulta confirmada na plataforma CONTA MÃE.`,
    ``,
    `Data e hora: ${when}`,
    `Sala de vídeo (Jitsi): ${opts.roomSlug}`,
    ``,
    `A mãe entra pela app em Especialistas na hora marcada.`,
  ].join('\n');

  const SUPPORT_BCC = 'suporte.contamae@gmail.com';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      bcc: [SUPPORT_BCC],
      subject,
      text,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error('[mp-webhook] resend specialist notify', res.status, body.slice(0, 500));
  }
}

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

  let payload: {
    type?: string;
    topic?: string;
    action?: string;
    data?: { id?: string };
    resource?: string;
  };
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return new Response('bad json', { status: 400, headers: corsHeaders });
  }

  let extRef = '';
  let mpPaymentId = '';
  let amount = NaN;

  /** Checkout API / Orders — Pix (webhook "Order" no painel MP) */
  if (payload.type === 'order' && payload.data?.id) {
    const orderId = String(payload.data.id).trim();
    const ordRes = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    const ord = (await ordRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!ordRes.ok || !ord) {
      console.error('[mp-webhook] fetch order', ordRes.status, ord);
      return new Response('order_fetch_failed', { status: 502, headers: corsHeaders });
    }

    extRef = ord.external_reference ? String(ord.external_reference).trim() : '';
    const txs = ord.transactions as { payments?: Array<Record<string, unknown>> } | undefined;
    const pay0 = Array.isArray(txs?.payments) ? txs!.payments[0] : undefined;
    mpPaymentId = pay0?.id ? String(pay0.id).trim() : '';
    const oStatus = String(ord.status || '');
    const oDetail = String(ord.status_detail || '');
    const pStatus = pay0 ? String(pay0.status || '') : '';
    const pDetail = pay0 ? String(pay0.status_detail || '') : '';

    const paid =
      (oStatus === 'processed' && (oDetail === 'accredited' || oDetail === 'paid')) ||
      (pStatus === 'processed' && (pDetail === 'accredited' || pDetail === 'paid'));

    if (!paid) {
      return new Response('order_not_paid', { status: 200, headers: corsHeaders });
    }

    const totalPaid = parseFloat(String(ord.total_paid_amount ?? ord.total_amount ?? '0'));
    const payAmt = pay0?.paid_amount != null ? parseFloat(String(pay0.paid_amount)) : totalPaid;
    amount = Number.isFinite(payAmt) && payAmt > 0 ? payAmt : totalPaid;
  } else {
    /** Checkout Pro — cartão (notificação payment) */
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

    mpPaymentId = paymentId;
    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const pay = (await payRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payRes.ok || !pay) {
      console.error('[mp-webhook] fetch payment', payRes.status, pay);
      return new Response('payment_fetch_failed', { status: 502, headers: corsHeaders });
    }

    const status = String(pay.status || '');
    extRef = pay.external_reference ? String(pay.external_reference).trim() : '';
    amount = Number(pay.transaction_amount);

    if (status !== 'approved' && status !== 'authorized') {
      return new Response('not_approved', { status: 200, headers: corsHeaders });
    }
  }

  if (!extRef || extRef.length < 32) {
    return new Response('no_external_ref', { status: 200, headers: corsHeaders });
  }

  if (!mpPaymentId) {
    return new Response('no_payment_id', { status: 200, headers: corsHeaders });
  }

  if (!Number.isFinite(amount) || amount < 49.89) {
    console.warn('[mp-webhook] amount mismatch', amount);
    return new Response('amount_mismatch', { status: 200, headers: corsHeaders });
  }

  const { data, error } = await admin.rpc('finalize_consultation_checkout_intent', {
    p_intent_id: extRef,
    p_mp_payment_id: mpPaymentId,
  });

  if (error) {
    console.error('[mp-webhook] finalize', error);
    if (String(error.message || '').includes('slot_taken')) {
      return new Response('slot_taken', { status: 200, headers: corsHeaders });
    }
    return new Response('finalize_failed', { status: 500, headers: corsHeaders });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'CONTA MÃE <onboarding@resend.dev>';
  const bookingId = data && typeof data === 'object' && 'booking_id' in data ? String((data as { booking_id?: string }).booking_id || '') : '';
  const idempotent = data && typeof data === 'object' && (data as { idempotent?: boolean }).idempotent === true;

  if (resendKey && bookingId && !idempotent) {
    try {
      const { data: row, error: rowErr } = await admin
        .from('consultation_bookings')
        .select('specialist_id, starts_at, jitsi_room_slug')
        .eq('id', bookingId)
        .maybeSingle();
      if (!rowErr && row?.specialist_id) {
        const { data: priv } = await admin
          .from('specialist_private_routes')
          .select('notify_email')
          .eq('specialist_id', row.specialist_id)
          .maybeSingle();
        const to = (priv?.notify_email as string | undefined)?.trim();
        if (to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
          const { data: spec } = await admin
            .from('specialists')
            .select('display_name')
            .eq('id', row.specialist_id)
            .maybeSingle();
          const name = ((spec?.display_name as string) || 'Especialista').trim();
          await sendSpecialistBookingEmail({
            resendKey,
            from: resendFrom,
            to,
            specialistName: name,
            startsAtIso: String(row.starts_at),
            roomSlug: String(row.jitsi_room_slug || ''),
          });
        }
      }
    } catch (e) {
      console.error('[mp-webhook] specialist email notify', e);
    }
  }

  console.log('[mp-webhook] ok', mpPaymentId, data);
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
