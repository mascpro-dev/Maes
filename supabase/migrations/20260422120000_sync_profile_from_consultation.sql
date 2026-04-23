-- Sincroniza o lembrete (profiles.next_appointment_*) com a próxima consulta confirmada
-- na plataforma, para a mãe não perder o compromisso após pagamento.

CREATE OR REPLACE FUNCTION public.sync_profile_next_appointment_from_consultations(p_mother_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz;
  v_name text;
BEGIN
  IF p_mother_id IS NULL THEN
    RETURN;
  END IF;

  SELECT b.starts_at, s.display_name
  INTO v_start, v_name
  FROM public.consultation_bookings b
  JOIN public.specialists s ON s.id = b.specialist_id
  WHERE b.mother_id = p_mother_id
    AND b.status = 'confirmed'
    AND b.starts_at > (timezone('utc', now()) - interval '1 minute')
  ORDER BY b.starts_at ASC
  LIMIT 1;

  -- Só preenche quando há consulta futura; não apaga entradas manuais de agenda.
  IF v_start IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET
    next_appointment_at = v_start,
    next_appointment_title = 'Consulta com ' || COALESCE(NULLIF(trim(v_name), ''), 'Especialista'),
    next_appointment_location = 'Videochamada — abre em Especialistas'
  WHERE id = p_mother_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_next_appointment_from_consultations(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_consultation_booking_sync_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_profile_next_appointment_from_consultations(NEW.mother_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.sync_profile_next_appointment_from_consultations(NEW.mother_id);
    IF OLD.mother_id IS NOT NULL
       AND OLD.mother_id IS DISTINCT FROM NEW.mother_id THEN
      PERFORM public.sync_profile_next_appointment_from_consultations(OLD.mother_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_consultation_booking_sync_profile() FROM PUBLIC;
DROP TRIGGER IF EXISTS consultation_booking_sync_profile ON public.consultation_bookings;
CREATE TRIGGER consultation_booking_sync_profile
  AFTER INSERT OR UPDATE OF status, mother_id, starts_at, specialist_id
  ON public.consultation_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_consultation_booking_sync_profile();

-- Correr uma vez: mães com consulta futura passam a ter o lembrete alinhado
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT b.mother_id
    FROM public.consultation_bookings b
    WHERE b.status = 'confirmed'
      AND b.starts_at > (timezone('utc', now()) - interval '1 minute')
  LOOP
    PERFORM public.sync_profile_next_appointment_from_consultations(r.mother_id);
  END LOOP;
END;
$$;
