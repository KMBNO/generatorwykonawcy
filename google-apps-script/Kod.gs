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
 *  4. Włącz plik manifestu: ⚙ Ustawienia projektu → zaznacz
 *     „Pokaż plik manifestu appsscript.json w edytorze", a następnie wklej
 *     do niego zawartość pliku appsscript.json z tego repozytorium.
 *     To ono ogranicza uprawnienia do samego odczytu Dysku.
 *  5. Uruchom raz funkcję ustawSekret() — sama wylosuje tajny klucz,
 *     zapisze go i wypisze w „Dzienniku wykonania". Skopiuj go.
 *  6. Wdróż → „Nowe wdrożenie" → typ: „Aplikacja internetowa"
 *       Wykonaj jako:      Ja
 *       Kto ma dostęp:     Wszyscy
 *     Kliknij „Wdróż" i zatwierdź uprawnienia.
 *  7. Skopiuj wyświetlony adres (kończy się na /exec).
 *  8. W generatorze: ⚙ Konfiguracja → sekcja „Zakres prac z Dysku Google"
 *     → wklej adres i ten sam SEKRET → „Zapisz dla zespołu".
 *
 *  ─────────────── UPRAWNIENIA ───────────────
 *
 *  Skrypt prosi o dokładnie dwa uprawnienia, oba minimalne:
 *    • Dysk Google — TYLKO ODCZYT (drive.readonly)
 *    • połączenie z usługą zewnętrzną (script.external_request)
 *
 *  Nie prosi o prawo do edycji, tworzenia ani usuwania czegokolwiek.
 *  Zakres jest wpisany na sztywno w pliku appsscript.json.
 *
 *  ─────────────── BEZPIECZEŃSTWO ───────────────
 *
 *  „Kto ma dostęp: Wszyscy" oznacza, że adres jest osiągalny bez logowania —
 *  dlatego każde wywołanie musi podać SEKRET, którego nie ma w kodzie
 *  generatora (leży w bazie Supabase, widocznej tylko dla zalogowanych).
 *  Dodatkowo skrypt czyta WYŁĄCZNIE z folderów, których nazwa zawiera
 *  „zakres" (u nas: „Zakres Remontu") — nawet znając adres i sekret, nie da
 *  się nim wyciągnąć dowolnego dokumentu z Dysku. Plik w środku może
 *  nazywać się dowolnie, bo nazw nikt nie pilnuje.
 *
 *  Jeśli sekret kiedykolwiek wycieknie: zmień wartość SEKRET w ustawieniach
 *  projektu i wklej nową w Konfiguracji generatora. Nic więcej nie trzeba.
 * ══════════════════════════════════════════════════════════════════ */

/** Czytamy tylko z folderów, których nazwa zawiera ten fragment.
 *  To jedyne zabezpieczenie „co wolno przeczytać" poza sekretem —
 *  nazwa PLIKU nie ma znaczenia. */
var FOLDER_MUSI_ZAWIERAC = 'zakres';

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

    if (folder.getName().toLowerCase().indexOf(FOLDER_MUSI_ZAWIERAC) === -1) {
      return odpowiedz({
        error: 'Folder „' + folder.getName() + '" nie jest folderem z zakresem remontu ' +
               '(nazwa folderu musi zawierać „' + FOLDER_MUSI_ZAWIERAC + '").'
      });
    }

    var znaleziono = znajdzPlikZakresu(folder);
    if (!znaleziono.plik) {
      return odpowiedz({
        error: znaleziono.pusty
          ? 'Folder „' + folder.getName() + '" jest pusty.'
          : 'W folderze „' + folder.getName() + '" nie ma dokumentu do odczytu ' +
            '(obsługiwane: dokument Google, .docx, .txt).'
      });
    }
    var plik = znaleziono.plik;

    var mime = plik.getMimeType();
    var nazwa = plik.getName();
    // Ile jeszcze czytelnych plików leżało obok — generator to pokaże,
    // żeby nikt nie zdziwił się, że wzięliśmy „ten drugi".
    var pominieto = znaleziono.wszystkie.length - 1;

    // Natywny dokument Google — czytany przez eksport z Dysku.
    // Świadomie NIE używamy DocumentApp: wymagałoby to uprawnienia
    // „przeglądanie, edytowanie, tworzenie i USUWANIE wszystkich dokumentów",
    // a skrypt ma wyłącznie czytać.
    if (mime === MimeType.GOOGLE_DOCS) {
      return odpowiedz({ nazwa: nazwa, zrodlo: 'Dokument Google', pominieto: pominieto, tekst: eksportujJakoTekst(plik.getId()) });
    }

    // Zwykły tekst
    if (mime === MimeType.PLAIN_TEXT || /\.txt$/i.test(nazwa)) {
      return odpowiedz({ nazwa: nazwa, zrodlo: 'Plik tekstowy', pominieto: pominieto, tekst: plik.getBlob().getDataAsString('UTF-8') });
    }

    // Word — oddajemy plik, a generator rozpakuje go w przeglądarce
    if (mime === MimeType.MICROSOFT_WORD || /\.docx$/i.test(nazwa)) {
      var bajty = plik.getBlob().getBytes();
      if (bajty.length > 7 * 1024 * 1024) {
        return odpowiedz({ error: 'Plik Worda jest za duży, żeby go przesłać (' + Math.round(bajty.length / 1048576) + ' MB). Pobierz go i wczytaj ręcznie.' });
      }
      return odpowiedz({ nazwa: nazwa, zrodlo: 'Plik Word', pominieto: pominieto, docxBase64: Utilities.base64Encode(bajty) });
    }

    return odpowiedz({ error: 'Nieobsługiwany typ pliku: ' + mime + '. Obsługiwane: dokument Google, .docx, .txt.' });

  } catch (err) {
    return odpowiedz({ error: 'Błąd skryptu: ' + (err && err.message ? err.message : err) });
  }
}

/** Wybiera dokument z zakresem. Nazwa pliku NIE ma znaczenia — liczy się to,
 *  że leży w folderze z zakresem (to sprawdza doGet) i że da się go odczytać.
 *
 *  Kolejność: dokument Google → .docx → .txt. W obrębie jednego typu wygrywa
 *  ostatnio modyfikowany, bo to zwykle ta wersja, nad którą ktoś pracował.
 *  Zwraca { plik, pusty, wszystkie } — „wszystkie" to nazwy czytelnych plików,
 *  żeby generator mógł pokazać, że w folderze leżało ich więcej niż jeden. */
function znajdzPlikZakresu(folder) {
  var kandydaci = [];
  var wszystkich = 0;
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    wszystkich++;
    var mime = f.getMimeType();
    var nazwa = f.getName();
    var ranga = -1;
    if (mime === MimeType.GOOGLE_DOCS) ranga = 0;
    else if (mime === MimeType.MICROSOFT_WORD || /\.docx$/i.test(nazwa)) ranga = 1;
    else if (mime === MimeType.PLAIN_TEXT || /\.txt$/i.test(nazwa)) ranga = 2;
    if (ranga >= 0) kandydaci.push({ plik: f, ranga: ranga, data: f.getLastUpdated().getTime(), nazwa: nazwa });
  }

  if (!kandydaci.length) return { plik: null, pusty: wszystkich === 0, wszystkie: [] };

  kandydaci.sort(function (a, b) {
    return a.ranga !== b.ranga ? a.ranga - b.ranga : b.data - a.data;
  });

  return {
    plik: kandydaci[0].plik,
    pusty: false,
    wszystkie: kandydaci.map(function (k) { return k.nazwa; })
  };
}

/* Eksport dokumentu Google do czystego tekstu przez API Dysku.
   Używa tokenu samego skryptu, więc mieści się w uprawnieniu „tylko odczyt". */
function eksportujJakoTekst(fileId) {
  var url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/export?mimeType=text/plain';
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Nie udało się odczytać dokumentu (kod ' + res.getResponseCode() + ')');
  }
  return res.getContentText('UTF-8');
}

function odpowiedz(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ★ URUCHOM TO RAZ, PRZED WDROŻENIEM ★
 *  Losuje sekret, zapisuje go we właściwościach skryptu i wypisuje w dzienniku.
 *  Skopiuj wypisaną wartość i wklej ją w generatorze:
 *  ⚙ Konfiguracja → „Zakres prac z Dysku Google" → pole „Tajny klucz".
 *  Nie musisz niczego wymyślać ani wpisywać ręcznie w ustawieniach projektu. */
function ustawSekret() {
  var znaki = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var sekret = '';
  for (var i = 0; i < 40; i++) {
    sekret += znaki.charAt(Math.floor(Math.random() * znaki.length));
  }
  PropertiesService.getScriptProperties().setProperty('SEKRET', sekret);
  Logger.log('Twój tajny klucz (skopiuj go do generatora):\n\n%s\n', sekret);
  return sekret;
}

/** Podgląd już ustawionego sekretu, gdybyś go zgubił. */
function pokazSekret() {
  var s = PropertiesService.getScriptProperties().getProperty('SEKRET');
  Logger.log(s ? ('Zapisany klucz:\n\n' + s + '\n') : 'Sekret nie jest jeszcze ustawiony — uruchom ustawSekret().');
  return s;
}

/** Do ręcznego sprawdzenia w edytorze: wstaw identyfikator folderu i uruchom.
 *  Wynik zobaczysz w widoku „Dziennik wykonania". */
function test_odczytu() {
  var FOLDER_DO_TESTU = 'wklej-tutaj-id-folderu';
  var folder = DriveApp.getFolderById(FOLDER_DO_TESTU);
  Logger.log('Folder: %s', folder.getName());
  if (folder.getName().toLowerCase().indexOf(FOLDER_MUSI_ZAWIERAC) === -1) {
    Logger.log('UWAGA: nazwa folderu nie zawiera „%s" — skrypt odmówi odczytu.', FOLDER_MUSI_ZAWIERAC);
    return;
  }
  var w = znajdzPlikZakresu(folder);
  if (!w.plik) { Logger.log(w.pusty ? 'Folder jest pusty.' : 'Brak czytelnego dokumentu w folderze.'); return; }
  Logger.log('Czytelne pliki: %s', w.wszystkie.join(', '));
  Logger.log('Wybrany: %s (%s)', w.plik.getName(), w.plik.getMimeType());
  if (w.plik.getMimeType() === MimeType.GOOGLE_DOCS) {
    Logger.log('Początek treści:\n%s', eksportujJakoTekst(w.plik.getId()).slice(0, 500));
  }
}
