create or replace function public.debug_create_workspace(
  workspace_name text,
  workspace_industry text,
  workspace_website text
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspaces (
    owner_id,
    name,
    industry,
    website
  )
  values (
    auth.uid(),
    workspace_name,
    workspace_industry,
    workspace_website
  )
  returning id into new_workspace_id;

  return json_build_object(
    'success', true,
    'workspace_id', new_workspace_id,
    'auth_uid', auth.uid()
  );

exception
  when others then
    return json_build_object(
      'success', false,
      'sqlstate', sqlstate,
      'message', sqlerrm,
      'detail', coalesce(pg_exception_detail, ''),
      'hint', coalesce(pg_exception_hint, ''),
      'context', coalesce(pg_exception_context, '')
    );
end;
$$;

grant execute on function public.debug_create_workspace(text, text, text)
to authenticated;