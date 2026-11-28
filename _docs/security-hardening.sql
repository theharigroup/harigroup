-- Security Advisor hardening (applied live). Trigger/helper functions must not be callable via the API.
revoke execute on function public.bk_validate(), public.portal_block_unlisted_signup(), public.portal_notify(), public.rls_auto_enable(), public.staff_guard() from public, anon, authenticated;
revoke execute on function public.bk_can_book(uuid), public.bk_is_admin(), public.bk_is_member() from public, anon;
grant execute on function public.bk_can_book(uuid), public.bk_is_admin(), public.bk_is_member() to authenticated;
alter function public.bk_email() set search_path = public;
