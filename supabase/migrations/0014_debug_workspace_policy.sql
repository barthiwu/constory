create or replace function public.debug_workspace_insert_policy(
  target_owner_id uuid
)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'auth_uid', auth.uid(),
    'target_owner_id', target_owner_id,
    'ids_match', auth.uid() = target_owner_id,
    'profile_exists', exists (
      select 1
      from public.profiles
      where id = target_owner_id
    )
  );
$$;

grant execute on function public.debug_workspace_insert_policy(uuid)
to authenticated;