-- Intenção de checkout: id da Order MP (fluxo Pix /v1/orders). Checkout Pro continua a usar mp_preference_id.

ALTER TABLE public.consultation_checkout_intents
  ADD COLUMN IF NOT EXISTS mp_order_id text;

COMMENT ON COLUMN public.consultation_checkout_intents.mp_order_id IS
  'Identificador da order Mercado Pago (POST /v1/orders) quando o Pix é gerado por Checkout API / Orders; vazio se só Checkout Pro.';
