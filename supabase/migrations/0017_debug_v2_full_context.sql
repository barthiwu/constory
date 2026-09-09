create or replace function public.debug_insert_probe_v2(
  p_owner_id uuid,
  workspace_name text
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result json;
  v_new_id uuid;
begin
  begin
    insert into public.workspaces (owner_id, name)
    values (p_owner_id, workspace_name)
    returning id into v_new_id;

    v_result := json_build_object(
      'inserted', true,
      'new_id', v_new_id
    );
  exception when others then
    v_result := json_build_object(
      'inserted', false,
      'sqlstate', sqlstate,
      'message', sqlerrm
    );
  end;

  return json_build_object(
    'insert_attempt', v_result,
    'auth_uid', auth.uid(),
    'p_owner_id', p_owner_id,
    'auth_role', auth.role(),
    'current_setting_role', current_setting('role', true),
    'session_user', session_user,
    'current_user', current_user,
    'raw_jwt_claims', current_setting('request.jwt.claims', true),
    'raw_jwt_claim_sub', current_setting('request.jwt.claim.sub', true)
  );
end;
$$;

grant execute on function public.debug_insert_probe_v2(uuid, text) to authenticated;
