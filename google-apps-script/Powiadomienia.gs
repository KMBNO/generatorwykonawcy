/**
 * ══════════════════════════════════════════════════════════════════
 *  KMBNO — powiadomienia o umowach czekających na akceptację
 *
 *  Po co: gdy ktoś z zespołu wyśle umowę do akceptacji, osoby
 *  akceptujące dostają maila, zamiast dowiadywać się o tym przypadkiem.
 *
 *  ⚠ To MUSI być OSOBNY projekt Apps Script — nie dokładaj tego kodu
 *  do „KMBNO — zakresy remontów". Tamten skrypt ma wyłącznie prawo
 *  czytania Dysku i niech tak zostanie; ten prosi o prawo wysyłania
 *  poczty. Dwa osobne projekty = dwa wąskie uprawnienia zamiast
 *  jednego szerokiego.
 *
 *  ─────────────── WDROŻENIE (raz, ~4 minuty) ───────────────
 *
 *  1. script.google.com → „Nowy projekt".
 *  2. Wklej całą zawartość tego pliku.
 *  3. Nazwij projekt, np. „KMBNO — powiadomienia o umowach".
 *  4. ⚙ Ustawienia projektu → zaznacz „Pokaż plik manifestu
 *     appsscript.json w edytorze" i wklej do niego zawartość pliku
 *     google-apps-script/appsscript-powiadomienia.json z repozytorium.
 *  5. Uruchom raz funkcję ustawSekret() — wylosuje klucz i wypisze go
 *     w „Dzienniku wykonania". Skopiuj.
 *  6. Wdróż → „Nowe wdrożenie" → „Aplikacja internetowa"
 *       Wykonaj jako:  Ja
 *       Kto ma dostęp: Wszyscy
 *  7. Skopiuj adres kończący się na /exec.
 *  8. Generator → ⚙ Konfiguracja → „Powiadomienia o umowach do
 *     akceptacji" → wklej adres i klucz → „Zapisz dla całego zespołu"
 *     → „Wyślij próbny mail".
 *
 *  ─────────────── UPRAWNIENIA ───────────────
 *
 *  Jedno: wysyłanie poczty jako osoba wdrażająca (script.send_mail).
 *  Maile wychodzą więc z jej adresu. Skrypt nie czyta skrzynki —
 *  MailApp potrafi tylko wysyłać.
 *
 *  ─────────────── BEZPIECZEŃSTWO ───────────────
 *
 *  Adres jest osiągalny bez logowania, dlatego:
 *   • każde wywołanie musi podać SEKRET (leży w Supabase, nie w kodzie),
 *   • wysyłka idzie WYŁĄCZNIE na adresy w domenie z DOZWOLONA_DOMENA —
 *     nawet znając adres i klucz, nie da się tym skryptem wysłać
 *     niczego na zewnątrz firmy,
 *   • treść jest wysyłana jako czysty tekst (żadnego HTML-a),
 *   • dzienny limit poniżej chroni przed zapętleniem się generatora.
 * ══════════════════════════════════════════════════════════════════ */

/** Maile wychodzą tylko na ten sufiks adresu. */
var DOZWOLONA_DOMENA = '@kmbno.pl';

/** Ile maili na dobę wolno wysłać temu skryptowi. */
var LIMIT_DZIENNY = 60;

function doGet(e) {
  try {
    var sekret = PropertiesService.getScriptProperties().getProperty('SEKRET');
    if (!sekret) {
      return odpowiedz({ error: 'Skrypt nie ma ustawionej właściwości SEKRET — uruchom ustawSekret().' });
    }

    var p = (e && e.parameter) ? e.parameter : {};
    if (p.klucz !== sekret) {
      return odpowiedz({ error: 'Brak dostępu — nieprawidłowy klucz.' });
    }

    var odbiorcy = String(p['do'] || '').split(',')
      .map(function (a) { return a.trim().toLowerCase(); })
      .filter(function (a) { return a && a.indexOf(DOZWOLONA_DOMENA) === a.length - DOZWOLONA_DOMENA.length; });

    if (!odbiorcy.length) {
      return odpowiedz({ error: 'Brak prawidłowych odbiorców w domenie ' + DOZWOLONA_DOMENA + '.' });
    }

    var temat = String(p.temat || 'Umowa do akceptacji').slice(0, 200);
    var tresc = String(p.tresc || '').slice(0, 4000);

    if (!przepustka(odbiorcy.length)) {
      return odpowiedz({ error: 'Dzienny limit ' + LIMIT_DZIENNY + ' maili został wyczerpany.' });
    }

    MailApp.sendEmail({
      to: odbiorcy.join(','),
      subject: temat,
      body: tresc + '\n\n—\nWiadomość wysłana automatycznie przez generator umów KMBNO.'
    });

    return odpowiedz({ ok: true, wyslano: odbiorcy.length, do: odbiorcy.join(',') });

  } catch (err) {
    return odpowiedz({ error: 'Błąd skryptu: ' + (err && err.message ? err.message : err) });
  }
}

/** Prosty licznik dobowy — chroni przed zapętleniem i przed cudzym
 *  wykorzystaniem adresu, gdyby klucz kiedyś wyciekł. */
function przepustka(ile) {
  var wl = PropertiesService.getScriptProperties();
  var dzis = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd');
  var stan = (wl.getProperty('LICZNIK') || '').split('|');
  var licznik = (stan[0] === dzis) ? parseInt(stan[1], 10) || 0 : 0;
  if (licznik + ile > LIMIT_DZIENNY) return false;
  wl.setProperty('LICZNIK', dzis + '|' + (licznik + ile));
  return true;
}

function odpowiedz(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** ★ URUCHOM TO RAZ, PRZED WDROŻENIEM ★ */
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

/** Ile maili poszło dziś i ile zostało. */
function stanLicznika() {
  var stan = (PropertiesService.getScriptProperties().getProperty('LICZNIK') || '').split('|');
  Logger.log('Dzień: %s, wysłano: %s z %s', stan[0] || '—', stan[1] || '0', LIMIT_DZIENNY);
}
