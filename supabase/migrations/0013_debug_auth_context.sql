create or replace function public.debug_auth_context()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'auth_uid', auth.uid(),
    'current_user', current_user,
    'jwt_role', auth.role()
  );
$$;

grant execute on function public.debug_auth_context() to authenticated;