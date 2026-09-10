# KMBNO — Generator Umów z Wykonawcami

Narzędzie dla działu remontów: generuje **Umowę o roboty budowlane** wraz z **Załącznikiem nr 1
(zakres remontu)**. Dane wykonawcy i zakres prac pobierane są z Monday, kwoty i terminy wpisuje się
w formularzu, a na wyjściu powstaje gotowy do podpisu dokument A4.

Zbudowany na tej samej zasadzie co generator umów sprzedaży: jeden plik `index.html`, bez backendu,
bez budowania. Logowanie i wspólna historia umów działają na tym samym projekcie Supabase, więc
**konta i hasła są te same** co w generatorze sprzedaży.

---

## Co robi

| Sekcja | Skąd dane |
|---|---|
| Wykonawca (imię, adres, PESEL, nr dowodu / NIP) | Monday — tablica `5030474320` |
| Lokalizacja, powierzchnia, zakres prac | Monday — tablica `5030474286`, kolumna „Zakres remontu" |
| Kwota, terminy, kara umowna, gwarancja | formularz |
| Treść umowy §1–§8 | szablon w generatorze |
| Historia wygenerowanych umów | Supabase, tabela `umowy_wykonawcy` |

Wykonawca może być osobą fizyczną (PESEL + dowód) albo firmą / JDG (NIP) — przełącznik u góry
formularza zmienia zarówno pola, jak i blok stron w umowie.

Umowa jest zawsze **zawierana zdalnie** („zawarta zdalnie w dniu … roku pomiędzy:"), zgodnie
z ustaleniem. Reprezentant KMBNO nie jest wymieniany w treści — jest tylko blok firmy i podpis
`ZAMAWIAJĄCY`, dokładnie jak w dotychczasowych umowach.

---

## Uruchomienie — 4 kroki

### 1. Baza w Supabase (raz, ~2 minuty)

Supabase → **SQL Editor** → **New query** → wklej całą zawartość `sql/setup.sql` → **Run**.

Tworzy to dwie tabele:
- `umowy_wykonawcy` — wspólna historia umów,
- `ustawienia` — wybrane tablice Monday, mapowanie kolumn i token Monday.

### 2. Hosting

Wrzuć `index.html` do nowego repozytorium na GitHubie i włącz **Settings → Pages → Deploy from
branch → main / root**. Po chwili generator jest pod `https://kmbno.github.io/<nazwa-repo>/`.

Repozytorium **może być publiczne** — w kodzie nie ma żadnych haseł, tokenów ani numerów PESEL
(patrz „Bezpieczeństwo" niżej).

### 3. Token Monday

Monday → avatar w prawym górnym rogu → **Developers** → **My access tokens** → skopiuj token.

W generatorze: **⚙ Konfiguracja** → wklej token → **Sprawdź połączenie** → **Zapisz dla całego
zespołu**. Token trafia do tabeli `ustawienia` w Supabase, więc reszta działu nie musi już nic
wklejać — wystarczy, że się zaloguje.

### 4. Tablice i kolumny

Tablice są już ustawione domyślnie (`5030474320` i `5030474286`), a **kolumny dopasowują się
automatycznie po nazwach** — generator pobiera listę kolumn z tablicy i szuka „Adres", „PESEL",
„Numer dowodu", „NIP", „Zakres remontu", „Powierzchnia", „Miejscowość".

Jeśli któraś kolumna zostanie dopasowana źle (albo dodacie nową), w Konfiguracji można wskazać ją
ręcznie z listy i zapisać dla całego zespołu. **Nie ma tu ID kolumn wpisanych na sztywno** — zmiana
nazwy kolumny w Monday nie psuje generatora, a dodanie nowej nie wymaga zmiany kodu.

---

## Jak się z tego korzysta

1. Wyszukaj **wykonawcę** — dane wchodzą z Monday. Jeśli czegoś brakuje (np. PESEL-u), generator
   wypisze czego i otworzy pola do ręcznego uzupełnienia.
2. Wyszukaj **inwestycję** — wpadają miejscowość, ulica, powierzchnia i zakres prac.
3. Uzupełnij **terminy** i **kwotę** (kwota słownie liczy się sama).
4. Przejrzyj **zakres prac** w polu tekstowym — to on staje się Załącznikiem nr 1. Można go dowolnie
   poprawić przed wygenerowaniem; przycisk „↻ Z Monday" przywraca wersję z tablicy.
5. **Generuj umowę** → podgląd. `✏️ Edytuj` pozwala poprawić dowolne słowo bezpośrednio
   w dokumencie, `Kopiuj tekst` wyciąga całość do schowka.
6. **PDF / Druk** — pobiera plik HTML z przyciskiem „Zapisz jako PDF / Drukuj". Umowa i załącznik
   są w jednym pliku, załącznik zaczyna się od nowej strony. Przy okazji umowa zapisuje się
   w historii.

### Zakres prac — skąd się bierze

W tablicy „🚧 Remonty" kolumna „Zakres remontu (link)" trzyma **odnośnik do folderu na Dysku Google**,
a nie samą treść — dokument z zakresem leży w tym folderze. Są trzy drogi, wszystkie w sekcji
„Załącznik nr 1":

1. **⤓ Z Dysku** — generator sam pobiera treść dokumentu i układa załącznik. Dzieje się to
   automatycznie zaraz po wybraniu inwestycji, o ile skonfigurowany jest skrypt z
   `google-apps-script/Kod.gs` (instrukcja wdrożenia w komentarzu na górze tego pliku,
   adres i klucz wpisuje się w ⚙ Konfiguracji).
2. **📂 Otwórz na Dysku** — otwiera folder tej inwestycji w nowej karcie.
3. **⬆ Z pliku Word** — wczytanie pobranego `.docx`; generator rozpakowuje go w przeglądarce.

**Nazwa pliku nie ma znaczenia** — dokument w folderze może nazywać się choćby „Dokument bez
tytułu". Skrypt bierze pierwszy czytelny dokument z folderu: najpierw dokument Google, potem
`.docx`, potem `.txt`, a gdy jest ich kilka — ostatnio modyfikowany (generator wtedy uprzedza, że
w folderze leżało więcej dokumentów).

Skrypt wymaga tajnego klucza — trzymanego w Supabase, nie w kodzie — i czyta wyłącznie z folderów,
**których nazwa zawiera „zakres"** (u nas: „Zakres Remontu"). To zastępuje wcześniejszy warunek na
nazwę pliku: nawet znając adres i klucz, nie da się tym skryptem wyciągnąć dowolnego dokumentu
z Dysku.

**Uwaga o kolumnach lustrzanych:** większość kolumn na tej tablicy to `mirror` (lustra z tablicy
Nieruchomości). Przez API zwracają one puste pole `text`, a wartość podają w `display_value` —
generator to obsługuje. Gdyby ktoś kiedyś dopisywał tu nowe kolumny, warto o tym pamiętać.

### Zakres prac — jak jest formatowany

Każda linia to jeden punkt listy. Nagłówkiem sekcji staje się linia, która:

- zaczyna się od `#`, albo
- kończy się dwukropkiem (`Łazienka:`), albo
- jest krótka, nie kończy się przecinkiem ani kropką i stoi przed listą lub po pustej linii
  (np. `Prace ogólne - wszystkie pomieszczenia`).

Puste linie oddzielają sekcje. Przecinki na końcach punktów są usuwane automatycznie, więc zakres
skopiowany z Monday 1:1 formatuje się sam.

### Dodatkowe paragrafy

Można dodać do 3 własnych paragrafów — wchodzą **przed** „Postanowienia końcowe", a numeracja
paragrafów przelicza się sama (§8, §9, …).

---

## Bezpieczeństwo

W kodzie generatora **nie ma żadnych sekretów**:

- token Monday leży w Supabase (tabela `ustawienia`, dostęp tylko dla zalogowanych) albo
  — w wariancie proxy — w sekretach Edge Function, gdzie przeglądarka w ogóle go nie widzi;
- nie ma PESEL-i ani numerów dowodów wpisanych w plik — dane wykonawców przychodzą z Monday
  dopiero po zalogowaniu;
- klucz Supabase w pliku (`sb_publishable_…`) jest **z założenia publiczny** — dostępu pilnują
  konta i reguły RLS, dokładnie tak jak w generatorze sprzedaży.

### Wariant maksymalny (opcjonalny)

`supabase/functions/monday/index.ts` to gotowa funkcja proxy. Po wdrożeniu (instrukcja w komentarzu
na górze pliku) token Monday nie opuszcza serwera, a funkcja dodatkowo odrzuca wszystko, co
próbowałoby **zapisać** cokolwiek do Monday. Wystarczy wkleić jej adres w Konfiguracji.

### Generator sprzedaży — przeniesiony na ten sam mechanizm

Repozytorium `KMBNO/generatorsprzedaz` zawierało wcześniej w kodzie dane 98 osób (PESEL-e, numery
dowodów, adresy), zeskanowany podpis i token Monday z prawem zapisu. Zostało to uporządkowane:
stare repozytorium usunięto wraz z historią commitów i odtworzono od zera z czystym kodem, token
w Monday unieważniono i wygenerowano nowy, a dane osobowe przeniesiono do Supabase (tabela
`pelnomocnicy` oraz klucze `mocodawca` i `podpis_b64` w `ustawienia`).

Oba generatory korzystają dziś z tego samego projektu Supabase i **tego samego wiersza z tokenem
Monday** — token wystarczy wkleić raz, w dowolnym z nich.

---

## Poprawki wobec wzoru z Busko-Zdrój

Treść merytoryczna została przepisana bez zmian; poprawione zostały wyłącznie potknięcia
redakcyjne:

| Miejsce | Było | Jest |
|---|---|---|
| §1 | punkty 1, 3, 4 (brak 2) | 1, 2, 3 |
| §6 | punkty 1, 2, 3, 5, 6 (brak 4) | 1, 2, 3, 4, 5 |
| §3 ust. 1 | „w terminie wyznaczonym przez **Wynajmującego**" (pozostałość z umowy najmu) | „przez **Zamawiającego**" |
| §6 ust. 3 | kara od kwoty „określonego w **ust. 1**" (kwota jest w ust. 2) | „określonego w **ust. 2**" |
| §6 ust. 1 | odesłanie do „§1 ust. 4" | „§1 ust. 3" (po naprawie numeracji §1) |
| §4 | punkty bez numeracji | numeracja 1–4 |
| §8 ust. 4 | „**Załączniki** nr 1 stanowi" | „**Załącznik** nr 1 stanowi" |
| kilka miejsc | „wynagrodzenia przysługując**emu** Wykonawcy" | „przysługując**ego** Wykonawcy" |
| §6 ust. 2 | „z odroczonym 14 terminem płatności" | „z odroczonym 14-**dniowym** terminem płatności" |

Dodane względem wzoru: kwota **słownie** przy wynagrodzeniu (standard w umowach, ułatwia też
wychwycenie pomyłki w kwocie).

Znaleziony przy okazji błąd w **generatorze sprzedaży**: funkcja liczby słownie zwraca
„dwadzieścia cztery *tysięcy*" zamiast „tysiące" dla liczb 22–24, 32–34 itd. Tutaj jest już
poprawione — mogę przenieść poprawkę do starego generatora.

---

## Struktura repozytorium

```
index.html                          ← cała aplikacja (jeden plik, bez budowania)
sql/setup.sql                       ← tabele w Supabase, do wykonania raz
google-apps-script/Kod.gs           ← skrypt czytający zakresy z Dysku Google
supabase/functions/monday/index.ts  ← opcjonalne proxy ukrywające token Monday
README.md
```
