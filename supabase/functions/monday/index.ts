/* ══════════════════════════════════════════════════════════════════
   Proxy do Monday API — wariant maksymalnie bezpieczny (opcjonalny)

   Po co: token Monday zostaje na serwerze Supabase. Przeglądarka
   nigdy go nie widzi, więc nawet gdyby ktoś otworzył kod generatora
   w narzędziach deweloperskich, nie ma czego wykleić.

   Dodatkowo funkcja:
     • wpuszcza tylko osoby zalogowane w generatorze,
     • przepuszcza wyłącznie zapytania odczytujące — każda próba
       zapisu do Monday (mutation) jest odrzucana.

   Wdrożenie (darmowy plan Supabase obejmuje Edge Functions):
     1. Supabase → Edge Functions → Deploy a new function
     2. Nazwa: monday        (adres: https://<projekt>.supabase.co/functions/v1/monday)
     3. Wklej ten plik jako index.ts
     4. Supabase → Edge Functions → monday → Secrets:
          MONDAY_TOKEN = <token z Monday>
     5. W generatorze → Konfiguracja → „Adres funkcji proxy" wklej adres z pkt. 2
        i kliknij „Zapisz dla całego zespołu". Pole z tokenem możesz wtedy zostawić puste.
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Tylko POST' }, 405);

  const token = Deno.env.get('MONDAY_TOKEN');
  if (!token) return json({ error: 'Brak sekretu MONDAY_TOKEN w Supabase' }, 500);

  // 1. Czy pyta ktoś zalogowany w generatorze?
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Brak autoryzacji' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await sb.auth.getUser();
  if (authErr || !user) return json({ error: 'Nieprawidłowa sesja — zaloguj się ponownie' }, 401);

  // 2. Treść zapytania
  let query: unknown;
  try {
    ({ query } = await req.json());
  } catch {
    return json({ error: 'Nieprawidłowy JSON' }, 400);
  }
  if (typeof query !== 'string' || !query.trim()) {
    return json({ error: 'Brak zapytania' }, 400);
  }

  // 3. Tylko odczyt — żadnych zmian w Monday
  if (/\b(mutation|create_|change_|delete_|duplicate_|archive_|move_)/i.test(query)) {
    return json({ error: 'Ta funkcja przepuszcza wyłącznie zapytania odczytujące' }, 403);
  }

  // 4. Przekaż do Monday
  try {
    const res = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return json({ error: 'Monday nie odpowiada: ' + (e as Error).message }, 502);
  }
});
