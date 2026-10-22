/* ══════════════════════════════════════════════════════════════════
   Funkcja "monday" — pośrednik między generatorem umów z wykonawcami
   a Monday API

   Bezpieczeństwo:
     • wpuszcza WYŁĄCZNIE zalogowanych użytkowników Supabase
       (sam klucz publiczny z kodu strony NIE wystarcza),
     • przepuszcza wyłącznie zapytania odczytujące — każda próba zapisu
       w Monday (mutation) jest odrzucana,
     • token Monday jest sekretem MONDAY_TOKEN i nie opuszcza serwera —
       nie ma go w kodzie strony, w bazie ani w przeglądarce.

   Wdrożenie:
     1. Supabase → Edge Functions → Deploy a new function → Via Editor,
        nazwa dokładnie: monday
     2. Wklej ten plik → Deploy.
     3. Edge Functions → Secrets → Add new secret:
          Name:  MONDAY_TOKEN
          Value: token z monday.com → Developers → My access tokens
     4. Poniżej w ALLOWED_ORIGINS wpisz adres, pod którym działa generator
        (sama domena, bez ścieżki), np. https://twoj-login.github.io
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// Skąd wolno wołać funkcję z przeglądarki — UZUPEŁNIJ swoim adresem GitHub Pages
const ALLOWED_ORIGINS = ['https://kmbno.github.io'];

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  const CORS = cors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tylko POST' }, 405);

  // 1. Tylko zalogowany użytkownik generatora
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return json({ error: 'Brak autoryzacji — zaloguj się' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
  if (authErr || !user) return json({ error: 'Nieprawidłowa sesja — zaloguj się ponownie' }, 401);

  // 2. Zapytanie — wyłącznie odczyt
  let body: { query?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Nieprawidłowy JSON' }, 400); }
  const q = typeof body.query === 'string' ? body.query.trim() : '';
  if (!q || q.length > 5000) return json({ error: 'Nieprawidłowe zapytanie' }, 400);
  if (/\b(mutation|subscription)\b/i.test(q) || !/^(query\b|\{)/i.test(q)) {
    return json({ error: 'Ta funkcja przepuszcza wyłącznie zapytania odczytujące' }, 403);
  }

  const token = Deno.env.get('MONDAY_TOKEN');
  if (!token) return json({ error: 'Brak sekretu MONDAY_TOKEN w Supabase' }, 500);

  // 3. Przekaż do Monday; odpowiedź wraca bez zmian (generator sam sprawdza pole "errors")
  try {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token, 'API-Version': '2024-01' },
      body: JSON.stringify({ query: q }),
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ error: 'Monday nie odpowiada: ' + (e as Error).message }, 502);
  }
});
