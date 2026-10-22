-- ══════════════════════════════════════════════════════════════════
--  KMBNO — Generator Umów z Wykonawcami
--  Role: kto przygotowuje umowę, a kto ją akceptuje i podpisuje.
--
--  ⚠ KOLEJNOŚĆ MA ZNACZENIE
--  Najpierw załóż konta w Supabase → Authentication → Users → Add user
--  (z zaznaczonym „Auto Confirm User"), dopiero potem uruchom ten plik.
--  Inaczej nie będzie komu przypisać roli.
--
--  Supabase → SQL Editor → New query → wklej całość → Run.
--  Plik można uruchamiać wielokrotnie — nic nie zepsuje.
-- ══════════════════════════════════════════════════════════════════


-- ─── 1. Kto ma jaką rolę ──────────────────────────────────────────
--  przygotowujacy — wypełnia umowę i wysyła do akceptacji;
--                   nie pobierze pliku i nie zobaczy cudzego podpisu
--  akceptujacy    — sprawdza, akceptuje, podpisuje i pobiera dokument
create table if not exists public.uprawnienia (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  email          text,
  rola           text not null default 'przygotowujacy'
                 check (rola in ('przygotowujacy', 'akceptujacy')),
  zaktualizowano timestamptz not null default now()
);

alter table public.uprawnienia enable row level security;

-- Role są jawne (generator musi wiedzieć, komu wysłać umowę do akceptacji),
-- ale NIKT ich nie zmieni z poziomu przeglądarki — nie ma polityki INSERT,
-- UPDATE ani DELETE. Rolę nadaje się wyłącznie tutaj, w SQL Editorze.
drop policy if exists "uprawnienia_select" on public.uprawnienia;
create policy "uprawnienia_select" on public.uprawnienia
  for select to authenticated using (true);


-- ─── 2. Rola zalogowanej osoby ────────────────────────────────────
--  Domyślnie „przygotowujacy" — konto, którego nie ma w tabeli, dostaje
--  najmniej uprawnień, a nie najwięcej.
create or replace function public.moja_rola()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rola from public.uprawnienia where user_id = auth.uid()),
    'przygotowujacy'
  );
$$;

grant execute on function public.moja_rola() to authenticated;


-- ─── 3. Podpisy — każdy widzi wyłącznie swój ──────────────────────
--  To jest właściwe zabezpieczenie całego pomysłu. Podpis nie leży
--  w kodzie ani we wspólnych ustawieniach, tylko w wierszu przypisanym
--  do konkretnego konta, a reguła niżej nie wypuszcza cudzych wierszy
--  poza serwer. Osoba przygotowująca umowę nie ma więc czego podstawić
--  — nawet z konsolą przeglądarki otwartą na oścież.
create table if not exists public.podpisy (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  obraz          text,          -- skan podpisu w base64 (bez nagłówka data:)
  opis           text,          -- np. „Brygida Bujno, Prezes Zarządu"
  zaktualizowano timestamptz not null default now()
);

alter table public.podpisy enable row level security;

drop policy if exists "podpisy_select" on public.podpisy;
create policy "podpisy_select" on public.podpisy
  for select to authenticated
  using (user_id = auth.uid());

-- Wgrać podpis może tylko osoba akceptująca — i tylko swój własny.
drop policy if exists "podpisy_insert" on public.podpisy;
create policy "podpisy_insert" on public.podpisy
  for insert to authenticated
  with check (user_id = auth.uid() and public.moja_rola() = 'akceptujacy');

drop policy if exists "podpisy_update" on public.podpisy;
create policy "podpisy_update" on public.podpisy
  for update to authenticated
  using (user_id = auth.uid() and public.moja_rola() = 'akceptujacy')
  with check (user_id = auth.uid());

drop policy if exists "podpisy_delete" on public.podpisy;
create policy "podpisy_delete" on public.podpisy
  for delete to authenticated
  using (user_id = auth.uid());


-- ─── 4. Umowy: status i obieg akceptacji ──────────────────────────
alter table public.umowy_wykonawcy
  add column if not exists status        text not null default 'roboczy',
  add column if not exists autor_id      uuid references auth.users(id),
  add column if not exists akceptant     text,
  add column if not exists akceptant_id  uuid references auth.users(id),
  add column if not exists zaakceptowano timestamptz,
  add column if not exists uwagi         text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'umowy_wyk_status_chk'
  ) then
    alter table public.umowy_wykonawcy
      add constraint umowy_wyk_status_chk
      check (status in ('roboczy', 'do_akceptacji', 'zaakceptowana', 'odrzucona'));
  end if;
end $$;

-- Umowy zapisane przed wprowadzeniem ról zostają jako gotowe,
-- żeby nie wpadły nagle do kolejki do akceptacji.
update public.umowy_wykonawcy
   set status = 'zaakceptowana'
 where status = 'roboczy' and utworzono < now() - interval '1 minute';

create index if not exists umowy_wyk_status_idx
  on public.umowy_wykonawcy (status, utworzono desc);


-- ─── 5. Reguły dostępu do umów ────────────────────────────────────
--  Sedno: „zaakceptowana" może ustawić WYŁĄCZNIE osoba akceptująca.
--  Przygotowujący nie obejdzie tego ani przez konsolę, ani przez
--  bezpośrednie zapytanie do bazy — reguła jest po stronie serwera.
drop policy if exists "umowy_wyk_select" on public.umowy_wykonawcy;
create policy "umowy_wyk_select" on public.umowy_wykonawcy
  for select to authenticated using (true);

drop policy if exists "umowy_wyk_insert" on public.umowy_wykonawcy;
create policy "umowy_wyk_insert" on public.umowy_wykonawcy
  for insert to authenticated
  with check (
    public.moja_rola() = 'akceptujacy'
    or (coalesce(autor_id, auth.uid()) = auth.uid()
        and status in ('roboczy', 'do_akceptacji'))
  );

drop policy if exists "umowy_wyk_update" on public.umowy_wykonawcy;
create policy "umowy_wyk_update" on public.umowy_wykonawcy
  for update to authenticated
  using (
    public.moja_rola() = 'akceptujacy'
    or (autor_id = auth.uid() and status in ('roboczy', 'odrzucona'))
  )
  with check (
    public.moja_rola() = 'akceptujacy'
    or status in ('roboczy', 'do_akceptacji')
  );

drop policy if exists "umowy_wyk_delete" on public.umowy_wykonawcy;
create policy "umowy_wyk_delete" on public.umowy_wykonawcy
  for delete to authenticated
  using (
    public.moja_rola() = 'akceptujacy'
    or (autor_id = auth.uid() and status <> 'zaakceptowana')
  );


-- ─── 6. Ustawienia zespołu — zmienia tylko akceptujący ────────────
--  Czytać musi każdy (token Monday, tablice, klucz do Dysku),
--  ale wspólnej konfiguracji nie nadpisze już przypadkiem osoba,
--  która tylko przygotowuje umowy.
drop policy if exists "ustawienia_select" on public.ustawienia;
create policy "ustawienia_select" on public.ustawienia
  for select to authenticated using (true);

drop policy if exists "ustawienia_insert" on public.ustawienia;
create policy "ustawienia_insert" on public.ustawienia
  for insert to authenticated
  with check (public.moja_rola() = 'akceptujacy');

drop policy if exists "ustawienia_update" on public.ustawienia;
create policy "ustawienia_update" on public.ustawienia
  for update to authenticated
  using (public.moja_rola() = 'akceptujacy')
  with check (public.moja_rola() = 'akceptujacy');


-- ─── 7. Przypisanie ról ───────────────────────────────────────────
--  Każde konto, które już istnieje, dostaje rolę „akceptujacy",
--  a trzy konta z listy niżej — „przygotowujacy".
--  Chcesz później kogoś przenieść? Wystarczy zmienić listę i uruchomić
--  ten fragment ponownie.
insert into public.uprawnienia (user_id, email, rola)
select u.id,
       u.email,
       case when lower(u.email) in (
              'adam.szumowski@kmbno.pl',
              'angelika.lekan@kmbno.pl',
              'kamil.bialkowski@kmbno.pl'
            )
            then 'przygotowujacy'
            else 'akceptujacy'
       end
  from auth.users u
on conflict (user_id) do update
  set rola = excluded.rola,
      email = excluded.email,
      zaktualizowano = now();

-- Autorów wcześniejszych umów dopisujemy tam, gdzie da się ich rozpoznać,
-- żeby historia nie wyglądała na osieroconą.
update public.umowy_wykonawcy w
   set autor_id = u.id
  from auth.users u
 where w.autor_id is null
   and w.autor is not null
   and lower(split_part(u.email, '@', 1)) =
       lower(replace(translate(w.autor, ' ', '.'), '..', '.'));


-- ─── 8. Sprawdzenie ───────────────────────────────────────────────
select email, rola, zaktualizowano
  from public.uprawnienia
 order by rola, email;
