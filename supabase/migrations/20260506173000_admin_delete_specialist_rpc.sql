-- =============================================================================
-- Admin: apagar especialista (consultation_bookings tinha ON DELETE RESTRICT → 409)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_specialist(
  p_specialist_id uuid,
  p_force_delete_bookings boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bookings int;
  v_deleted int;
BEGIN
  IF NOT public.is_aura_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_specialist_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.specialists s WHERE s.id = p_specialist_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'specialist_not_found');
  END IF;

  SELECT COUNT(*)::int INTO v_bookings FROM public.consultation_bookings b WHERE b.specialist_id = p_specialist_id;

  IF v_bookings > 0 AND NOT p_force_delete_bookings THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'has_bookings',
      'bookings_count', v_bookings
    );
  END IF;

  IF v_bookings > 0 AND p_force_delete_bookings THEN
    DELETE FROM public.consultation_bookings WHERE specialist_id = p_specialist_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    v_deleted := 0;
  END IF;

  DELETE FROM public.specialists WHERE id = p_specialist_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_bookings', COALESCE(v_deleted, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_delete_specialist(uuid, boolean) IS
  'Painel admin: remove specialist; exige confirmação no cliente se houver consultation_bookings (RESTRICT na FK original).';

REVOKE ALL ON FUNCTION public.admin_delete_specialist(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_specialist(uuid, boolean) TO authenticated;
