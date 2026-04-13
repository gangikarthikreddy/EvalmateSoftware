-- Project updates for document uploads, course-level analytics, email visibility, and local management features

alter table public.assignments
  add column if not exists problem_file_path text,
  add column if not exists criteria_file_path text;

alter table public.rubrics
  add column if not exists criteria_file_path text;

alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.user_id = u.id
  and (p.email is distinct from u.email);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.sync_profile_email()
returns trigger as $$
begin
  update public.profiles
  set email = new.email,
      updated_at = now()
  where user_id = new.id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_updated_sync_profile on auth.users;
create trigger on_auth_user_updated_sync_profile
after update of email on auth.users
for each row
execute function public.sync_profile_email();

insert into storage.buckets (id, name, public)
values ('instructor-docs', 'instructor-docs', false)
on conflict (id) do nothing;

drop policy if exists "Instructors can upload own docs" on storage.objects;
create policy "Instructors can upload own docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'instructor-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Instructors can view own docs" on storage.objects;
create policy "Instructors can view own docs"
on storage.objects for select to authenticated
using (
  bucket_id = 'instructor-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Students can view instructor docs for enrolled courses" on storage.objects;
create policy "Students can view instructor docs for enrolled courses"
on storage.objects for select to authenticated
using (
  bucket_id = 'instructor-docs'
  and exists (
    select 1
    from public.assignments a
    join public.course_enrollments ce on ce.course_id = a.course_id
    where (
      a.problem_file_path = name
      or a.criteria_file_path = name
    )
    and ce.student_id = auth.uid()
  )
);

drop policy if exists "Instructors can delete own docs" on storage.objects;
create policy "Instructors can delete own docs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'instructor-docs'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Students can unenroll" on public.course_enrollments;
create policy "Students can unenroll"
on public.course_enrollments for delete to authenticated
using (auth.uid() = student_id);

drop policy if exists "Instructors can delete submissions for own courses" on public.submissions;
create policy "Instructors can delete submissions for own courses"
on public.submissions for delete to authenticated
using (
  exists (
    select 1 from public.assignments a
    join public.courses c on c.id = a.course_id
    where a.id = assignment_id and c.instructor_id = auth.uid()
  )
);
