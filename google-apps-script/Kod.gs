/**
 * ══════════════════════════════════════════════════════════════════
 *  KMBNO — odczyt zakresu remontu z Dysku Google
 *
 *  Po co: w Monday (tablica „🚧 Remonty") kolumna „Zakres remontu (link)"
 *  trzyma tylko odnośnik do folderu na Dysku. Treść zakresu leży w pliku
 *  w tym folderze. Ten skrypt na żądanie zwraca tę treść, dzięki czemu
 *  generator umów sam wypełnia Załącznik nr 1 — bez pobierania plików.
 *
 *  ─────────────── WDROŻENIE (raz, ~5 minut) ───────────────
 *
 *  1. Wejdź na script.google.com → „Nowy projekt".
 *  2. Wklej całą zawartość tego pliku, zastępując to, co tam jest.
 *  3. Nazwij projekt, np. „KMBNO — zakresy remontów".
 *  4. Ustaw tajny klucz:
 *       ⚙ Ustawienia projektu → „Właściwości skryptu" → „Dodaj właściwość"
 *       Nazwa:    SEKRET
 *       Wartość:  długi losowy ciąg, np. 30 znaków (wymyśl własny)
 *  5. Wdróż → „Nowe wdrożenie" → typ: „Aplikacja internetowa"
 *       Wykonaj jako:      Ja
 *       Kto ma dostęp:     Wszyscy
 *     Kliknij „Wdróż" i zatwierdź uprawnienia do Dysku.
 *  6. Skopiuj wyświetlony adres (kończy się na /exec).
 *  7. W generatorze: ⚙ Konfiguracja → sekcja „Zakres prac z Dysku Google"
 *     → wklej adres i ten sam SEKRET → „Zapisz dla zespołu".
 *
 *  ─────────────── BEZPIECZEŃSTWO ───────────────
 *
 *  „Kto ma dostęp: Wszyscy" oznacza, że adres jest osiągalny bez logowania —
 *  dlatego każde wywołanie musi podać SEKRET, którego nie ma w kodzie
 *  generatora (leży w bazie Supabase, widocznej tylko dla zalogowanych).
 *  Dodatkowo skrypt zwraca WYŁĄCZNIE pliki, których nazwa zaczyna się
 *  od „zakres" — nawet znając adres i sekret, nie da się nim wyciągnąć
 *  dowolnego dokumentu z Dysku.
 *
 *  Jeśli sekret kiedykolwiek wycieknie: zmień wartość SEKRET w ustawieniach
 *  projektu i wklej nową w Konfiguracji generatora. Nic więcej nie trzeba.
 * ══════════════════════════════════════════════════════════════════ */

/** Zwracamy tylko pliki o nazwie zaczynającej się od tego przedrostka. */
var PRZEDROSTEK = 'zakres';

function doGet(e) {
  try {
    var sekret = PropertiesService.getScriptProperties().getProperty('SEKRET');
    if (!sekret) {
      return odpowiedz({ error: 'Skrypt nie ma ustawionej właściwości SEKRET (Ustawienia projektu → Właściwości skryptu).' });
    }

    var param = (e && e.parameter) ? e.parameter : {};
    if (param.klucz !== sekret) {
      return odpowiedz({ error: 'Brak dostępu — nieprawidłowy klucz.' });
    }

    var folderId = String(param.folder || '').trim();
    if (!folderId) {
      return odpowiedz({ error: 'Nie podano identyfikatora folderu.' });
    }

    var folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (err) {
      return odpowiedz({ error: 'Nie mam dostępu do tego folderu albo on nie istnieje.' });
    }

    var plik = znajdzPlikZakresu(folder);
    if (!plik) {
      return odpowiedz({
        error: 'W folderze „' + folder.getName() + '" nie ma pliku o nazwie zaczynającej się od „' + PRZEDROSTEK + '".'
      });
    }

    var mime = plik.getMimeType();
    var nazwa = plik.getName();

    // Natywny dokument Google — najprostszy i najczęstszy przypadek
    if (mime === MimeType.GOOGLE_DOCS) {
      var tekst = DocumentApp.openById(plik.getId()).getBody().getText();
      return odpowiedz({ nazwa: nazwa, zrodlo: 'Dokument Google', tekst: tekst });
    }

    // Zwykły tekst
    if (mime === MimeType.PLAIN_TEXT) {
      return odpowiedz({ nazwa: nazwa, zrodlo: 'Plik tekstowy', tekst: plik.getBlob().getDataAsString('UTF-8') });
    }

    // Word — oddajemy plik, a generator rozpakuje go w przeglądarce
    if (mime === MimeType.MICROSOFT_WORD || /\.docx$/i.test(nazwa)) {
      var bajty = plik.getBlob().getBytes();
      if (bajty.length > 7 * 1024 * 1024) {
        return odpowiedz({ error: 'Plik Worda jest za duży, żeby go przesłać (' + Math.round(bajty.length / 1048576) + ' MB). Pobierz go i wczytaj ręcznie.' });
      }
      return odpowiedz({ nazwa: nazwa, zrodlo: 'Plik Word', docxBase64: Utilities.base64Encode(bajty) });
    }

    return odpowiedz({ error: 'Nieobsługiwany typ pliku: ' + mime + '. Obsługiwane: dokument Google, .docx, .txt.' });

  } catch (err) {
    return odpowiedz({ error: 'Błąd skryptu: ' + (err && err.message ? err.message : err) });
  }
}

/** Pierwszy plik w folderze, którego nazwa zaczyna się od „zakres".
 *  Dokumenty Google mają pierwszeństwo — są najtańsze w odczycie. */
function znajdzPlikZakresu(folder) {
  var pasujace = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().toLowerCase().indexOf(PRZEDROSTEK) === 0) pasujace.push(f);
  }
  if (!pasujace.length) return null;
  for (var i = 0; i < pasujace.length; i++) {
    if (pasujace[i].getMimeType() === MimeType.GOOGLE_DOCS) return pasujace[i];
  }
  return pasujace[0];
}

function odpowiedz(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Do ręcznego sprawdzenia w edytorze: wstaw identyfikator folderu i uruchom.
 *  Wynik zobaczysz w widoku „Dziennik wykonania". */
function test_odczytu() {
  var FOLDER_DO_TESTU = 'wklej-tutaj-id-folderu';
  var folder = DriveApp.getFolderById(FOLDER_DO_TESTU);
  var plik = znajdzPlikZakresu(folder);
  if (!plik) { Logger.log('Nie znalazłem pliku zaczynającego się od „%s"', PRZEDROSTEK); return; }
  Logger.log('Plik: %s (%s)', plik.getName(), plik.getMimeType());
  if (plik.getMimeType() === MimeType.GOOGLE_DOCS) {
    Logger.log('Początek treści:\n%s', DocumentApp.openById(plik.getId()).getBody().getText().slice(0, 500));
  }
}
