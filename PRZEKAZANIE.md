# Przekazanie generatora umów z wykonawcami — instrukcja dla Brygidy

Ten plik jest napisany tak, żeby mógł go przeczytać Twój Claude i przeprowadzić Cię przez
przenosiny krok po kroku. Generator przechodzi z konta KMBNO (Maciej) na Twoje konta:
**Twój GitHub, Twój projekt Supabase, Twój token Monday**. Skrypty Google (zakresy z Dysku
i maile o akceptacji) zostają obecne — ich adresy i klucze są w pliku z danymi.

Dostaniesz od Macieja osobno, **nie przez GitHub**, prywatny plik
`PRYWATNE-import-wykonawcy.sql`. Jest w nim historia umów (z danymi wykonawców), role,
podpisy i konfiguracja z kluczami skryptów Google. Nie wrzucaj go do repozytorium ani nikomu nie
przesyłaj dalej; po imporcie usuń go z dysku.

---

## Zasady bezpieczeństwa (obowiązują przy każdej zmianie)

- Repozytorium i strona są **publiczne**. W `index.html` nie może być: PESEL-i, numerów dowodów,
  adresów osób, numerów kont, podpisów, tokenów ani kluczy skryptów. Wszystko to żyje w Supabase
  i wczytuje się dopiero po zalogowaniu.
- Token Monday trzymamy **wyłącznie** jako sekret funkcji `monday` na Supabase (`MONDAY_TOKEN`) —
  nigdy w kodzie, w bazie ani w przeglądarce.
- W Supabase **rejestracja musi być wyłączona** — konta zakłada się ręcznie. Gdy ktoś odchodzi
  z firmy, usuń jego konto (Authentication → Users).
- Klucz `sb_publishable_…` w kodzie jest z założenia publiczny; dostępu pilnują konta i reguły RLS.

---

## Krok 1 — GitHub

1. Na swoim koncie GitHub utwórz nowe, puste repozytorium (np. `generatorwykonawcy`).
2. Skopiuj do niego **same pliki** z `KMBNO/generatorwykonawcy` — najprościej: na GitHubie
   „Code → Download ZIP", rozpakuj i wgraj zawartość (bez folderu `.git`). Nie forkuj i nie
   klonuj z historią.
3. Settings → Pages → Deploy from branch → `main` / root. Zanotuj adres strony,
   np. `https://<twoj-login>.github.io/generatorwykonawcy/`.

## Krok 2 — Supabase: projekt i konta

1. Załóż nowy projekt na supabase.com (region: Frankfurt / eu-central-1).
2. Authentication → Sign In / Providers → **wyłącz „Allow new users to sign up"**.
3. Authentication → Users → **Add user** dla każdej osoby, która ma korzystać z generatora
   (zaznacz „Auto Confirm User"). **Adresy e-mail muszą być takie same jak dotąd**
   (np. `imie.nazwisko@kmbno.pl`) — import dopasowuje umowy, role i podpisy po adresie e-mail.
   Lista osób, które są w historii, jest w komentarzu na górze pliku z importem.
4. Settings → API: zanotuj **Project URL** i klucz **publishable** (`sb_publishable_…`).

## Krok 3 — Supabase: tabele i reguły

SQL Editor → New query → wklej i uruchom po kolei:

1. `sql/setup.sql`
2. `sql/role.sql`
3. `sql/prog.sql`

Każdy plik można uruchamiać wielokrotnie.

## Krok 4 — Import danych (plik od Macieja)

Dopiero **po** założeniu kont z kroku 2: SQL Editor → wklej całą zawartość
`PRYWATNE-import-wykonawcy.sql` → Run. Jeśli Supabase pokaże okno „Potential issue detected" o tabeli
`_pakiet` bez RLS, kliknij **Run and enable RLS** (to tymczasowa tabela, znika po imporcie). Na końcu wyświetli się podsumowanie: ile umów, ról
i podpisów weszło oraz lista adresów, dla których nie znaleziono konta (te umowy wejdą bez
przypisanego autora — można dołożyć konto i uruchomić import ponownie, nic się nie zdubluje).

Potem usuń plik z dysku.

## Krok 5 — Funkcja `monday` i token

1. Edge Functions → Deploy a new function → Via Editor → nazwa **`monday`**.
2. Wklej `supabase/functions/monday/index.ts`. W `ALLOWED_ORIGINS` wpisz swoją domenę z kroku 1
   (sama domena, bez ścieżki, np. `https://<twoj-login>.github.io`) → Deploy.
3. Edge Functions → Secrets → `MONDAY_TOKEN` = Twój token z Monday (avatar → Developers →
   My access tokens). Twoje konto Monday musi mieć dostęp do tablic wykonawców
   (`5030474320`) i remontów (`5030474286`).

## Krok 6 — Adres projektu w kodzie

W `index.html` podmień stary projekt (`pzxflijplvjllqdihzcx`) na swój w **trzech** miejscach:

- `SUPABASE_URL` i `SUPABASE_KEY` (stałe na początku skryptu),
- tag `<meta http-equiv="Content-Security-Policy">` na samej górze pliku — adres występuje tam
  dwa razy (`https://…supabase.co` i `wss://…supabase.co`).

Bez zmiany w CSP przeglądarka zablokuje połączenie z bazą. Zapisz zmiany w repozytorium.

## Krok 7 — Sprawdzenie

1. Otwórz stronę z kroku 1, zaloguj się.
2. Lewy panel: „… wykonawców z Monday" i „… pozycji z Monday" — liczby większe od zera.
3. Historia umów: widać przeniesione umowy z autorami i statusami.
4. ⚙ Konfiguracja → „Sprawdź połączenie" (Monday), „Wyślij próbny mail", sprawdzenie Dysku.
5. Akceptujący: zakładka „Do akceptacji" działa, podpis jest widoczny.
6. Bezpieczeństwo — z dowolnego terminala:
   `curl -X POST https://<twoj-projekt>.supabase.co/functions/v1/monday -H "Content-Type: application/json" -d '{"query":"{me{name}}"}'`
   musi zwrócić **401** (bez logowania funkcja nic nie oddaje).

## Krok 8 — Daj znać Maciejowi

Gdy wszystko działa, Maciej usunie stare repozytorium `KMBNO/generatorwykonawcy` i dane
wykonawców ze swojego projektu Supabase. Pracownikom podaj nowy adres generatora.
