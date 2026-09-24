-- ══════════════════════════════════════════════════════════════════
--  KMBNO — Generator Umów z Wykonawcami
--  Uzupełnienie do sql/role.sql — uruchom PO nim.
--
--  Dokłada trzy rzeczy, o które poprosił dział remontów:
--   1. gotowy, podpisany dokument zapisywany przy umowie w chwili
--      akceptacji — żeby operator mógł go potem pobrać i wydrukować,
--   2. próg kwotowy: umowy do ustalonej kwoty operator wystawia sam,
--      bez akceptacji i bez podpisu,
--   3. pilnowanie tego progu PO STRONIE SERWERA, a nie tylko w
--      przeglądarce — operator nie wystawi sobie sam umowy na 50 000 zł
--      przez podmianę czegokolwiek w kodzie strony.
--
--  Supabase → SQL Editor → New query → wklej całość → Run.
--  Plik można uruchamiać wielokrotnie.
-- ══════════════════════════════════════════════════════════════════


-- ─── 1. Miejsce na gotowy dokument ────────────────────────────────
--  W chwili akceptacji przeglądarka osoby podpisującej składa cały
--  dokument (umowa + załącznik + podpis) i zapisuje go tutaj jako
--  gotowy plik. Operator pobiera dokładnie to, co zostało zatwierdzone —
--  nie składa dokumentu na nowo, więc nie ma mowy o tym, żeby pobrał
--  coś innego, niż faktycznie zaakceptowano.
alter table public.umowy_wykonawcy
  add column if not exists dokument text;


-- ─── 2. Nowy status: umowa wystawiona samodzielnie ────────────────
alter table public.umowy_wykonawcy
  drop constraint if exists umowy_wyk_status_chk;

alter table public.umowy_wykonawcy
  add constraint umowy_wyk_status_chk
  check (status in ('roboczy', 'do_akceptacji', 'zaakceptowana', 'odrzucona', 'samodzielna'));


-- ─── 3. Próg kwotowy ──────────────────────────────────────────────
--  Wartość bierzemy z tych samych ustawień, które widać w Konfiguracji
--  generatora (klucz „progKwota"). Zmiana progu = jedno pole w interfejsie,
--  bez ruszania SQL-a. Brak wartości = 0 = próg wyłączony, czyli każda
--  umowa idzie przez akceptację.
create or replace function public.prog_kwotowy()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(
      regexp_replace(
        replace(
          coalesce((select wartosc->>'progKwota'
                      from public.ustawienia
                     where klucz = 'konfiguracja_wykonawcy'), ''),
          ',', '.'),
        '[^0-9.]', '', 'g'),
      '')::numeric,
    0);
$$;

grant execute on function public.prog_kwotowy() to authenticated;


--  Kwota umowy siedzi w formularzu jako tekst („24 500", „6000,50"),
--  więc przed porównaniem trzeba ją uczciwie odczytać. Brak kwoty
--  zwraca -1, żeby pusta umowa nigdy nie przeszła jako „poniżej progu".
create or replace function public.kwota_umowy(d jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(replace(coalesce(d->>'kwota', ''), ',', '.'), '[^0-9.]', '', 'g'),
      '')::numeric,
    -1);
$$;

grant execute on function public.kwota_umowy(jsonb) to authenticated;


-- ─── 4. Reguły dostępu z uwzględnieniem progu ─────────────────────
--  Osoba przygotowująca może teraz oznaczyć umowę jako „samodzielna",
--  ale WYŁĄCZNIE gdy kwota mieści się w progu. Powyżej progu baza
--  odrzuci zapis — niezależnie od tego, co pokazuje przeglądarka.
drop policy if exists "umowy_wyk_insert" on public.umowy_wykonawcy;
create policy "umowy_wyk_insert" on public.umowy_wykonawcy
  for insert to authenticated
  with check (
    public.moja_rola() = 'akceptujacy'
    or (
      coalesce(autor_id, auth.uid()) = auth.uid()
      and (
        status in ('roboczy', 'do_akceptacji')
        or (status = 'samodzielna'
            and public.kwota_umowy(dane) > 0
            and public.kwota_umowy(dane) <= public.prog_kwotowy())
      )
    )
  );

drop policy if exists "umowy_wyk_update" on public.umowy_wykonawcy;
create policy "umowy_wyk_update" on public.umowy_wykonawcy
  for update to authenticated
  using (
    public.moja_rola() = 'akceptujacy'
    or (autor_id = auth.uid() and status in ('roboczy', 'odrzucona', 'samodzielna'))
  )
  with check (
    public.moja_rola() = 'akceptujacy'
    or (
      status in ('roboczy', 'do_akceptacji')
      or (status = 'samodzielna'
          and public.kwota_umowy(dane) > 0
          and public.kwota_umowy(dane) <= public.prog_kwotowy())
    )
  );

--  Umowy wystawione samodzielnie autor może skasować (np. pomyłka),
--  zaakceptowanych nie rusza nikt poza osobą akceptującą.
drop policy if exists "umowy_wyk_delete" on public.umowy_wykonawcy;
create policy "umowy_wyk_delete" on public.umowy_wykonawcy
  for delete to authenticated
  using (
    public.moja_rola() = 'akceptujacy'
    or (autor_id = auth.uid() and status <> 'zaakceptowana')
  );


-- ─── 5. Ustawienie progu na starcie ───────────────────────────────
--  6000 zł, zgodnie z ustaleniem. Później zmienia się to w Konfiguracji
--  generatora, nie tutaj.
update public.ustawienia
   set wartosc = jsonb_set(wartosc, '{progKwota}', '"6000"', true),
       zaktualizowano = now()
 where klucz = 'konfiguracja_wykonawcy';


-- ─── 6. Sprawdzenie ───────────────────────────────────────────────
select public.prog_kwotowy() as prog_zl,
       public.kwota_umowy('{"kwota":"5 999,99"}'::jsonb) as przyklad_ponizej,
       public.kwota_umowy('{"kwota":"24500"}'::jsonb)    as przyklad_powyzej,
       public.kwota_umowy('{}'::jsonb)                    as przyklad_bez_kwoty;
