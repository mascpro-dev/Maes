-- Texto alinhado ao fluxo real: o app não envia à operadora; a titular imprime o relatório.
UPDATE public.refunds
SET recipient_label = 'Plano de saúde ou genitor (envio por ti, com relatório impresso do Conta Mãe)'
WHERE recipient_label = 'Operadora do teu plano de saúde (canal Conta Mãe)';

ALTER TABLE public.refunds
  ALTER COLUMN recipient_label SET DEFAULT 'Plano de saúde ou genitor (envio por ti, com relatório impresso do Conta Mãe)';
