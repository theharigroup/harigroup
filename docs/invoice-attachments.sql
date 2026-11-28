-- Invoice photos: a column for the file list + a PRIVATE storage bucket with staff-only rules.
-- Run once in the invoice_management project (SQL editor). Safe to run again.
alter table public.invoices add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-files', 'invoice-files', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists inv_files_select on storage.objects;
create policy inv_files_select on storage.objects for select to authenticated
  using (bucket_id = 'invoice-files' and public.staff_role() is not null);

drop policy if exists inv_files_insert on storage.objects;
create policy inv_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoice-files'
              and public.staff_role() in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Administrator'));

drop policy if exists inv_files_delete on storage.objects;
create policy inv_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoice-files'
         and public.staff_role() in ('Solvent Manager','Chemical Manager','Glassware Manager','Lab Receiver','Administrator'));
