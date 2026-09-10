-- =============================================================================
-- Constory V1 — fix accept_workspace_invite's "column reference workspace_id
-- is ambiguous" (Postgres 42702), found live-testing the invite-accept flow.
--
-- RETURNS TABLE (ok boolean, reason text, workspace_id uuid) implicitly
-- declares `workspace_id` as a PL/pgSQL variable in the function body's
-- scope. The function never reads that variable directly (every reference
-- is qualified as v_invite.workspace_id), but the embedded
-- `on conflict (workspace_id, user_id)` clause's bare column list is still
-- subject to PL/pgSQL's variable-vs-column resolution — and Postgres
-- refuses to guess, raising 42702 instead. `#variable_conflict use_column`
-- tells it to always prefer the table column over a same-named PL/pgSQL
-- variable, which is what every bare reference in this function actually
-- needs (the function has no bare, unqualified use of the variable form).
-- =============================================================================

create or replace function public.accept_workspace_invite(p_token uuid)
returns table (ok boolean, reason text, workspace_id uuid)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_invite record;
  v_caller_email text;
begin
  select * into v_invite from public.workspace_invites where token = p_token;

  if v_invite is null then
    return query select false, 'not_found', null::uuid;
    return;
  end if;

  if v_invite.status <> 'pending' then
    return query select false, v_invite.status, v_invite.workspace_id;
    return;
  end if;

  if v_invite.expires_at < now() then
    return query select false, 'expired', v_invite.workspace_id;
    return;
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();
  if v_caller_email is null or lower(v_caller_email) <> lower(v_invite.email) then
    return query select false, 'email_mismatch', v_invite.workspace_id;
    return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, auth.uid(), v_invite.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
    set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
    where token = p_token;

  return query select true, 'accepted', v_invite.workspace_id;
end;
$$;

grant execute on function public.accept_workspace_invite(uuid) to authenticated;
