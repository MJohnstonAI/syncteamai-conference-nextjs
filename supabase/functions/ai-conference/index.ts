const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, selectedAvatar, modelId, openRouterKey } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enforce BYOK: require OpenRouter key for all users (including admin)
    if (!openRouterKey) {
      return new Response(JSON.stringify({ error: 'OpenRouter API key required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    const apiKey = openRouterKey as string;
    const body: { model: string; messages: Array<{ role: string; content: unknown }>; stream: boolean } = {
      model: modelId,
      messages,
      stream: false,
    };

    // Optional OpenRouter attribution headers (configurable)
    const referer = Deno.env.get('OPENROUTER_REFERER') || '';
    const title = Deno.env.get('OPENROUTER_TITLE') || '';

    // Retry with simple backoff
    const BACKOFFS = [500, 1000, 2000];
    for (let attempt = 0; attempt < BACKOFFS.length + 1; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(referer ? { 'HTTP-Referer': referer } : {}),
          ...(title ? { 'X-Title': title } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        return new Response(JSON.stringify({ response: data?.choices?.[0]?.message?.content || '' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (res.status === 429 && attempt < BACKOFFS.length) {
        const jitter = Math.random() * 200;
        await new Promise((r) => setTimeout(r, BACKOFFS[attempt] + jitter));
        continue;
      }

      const errText = await res.text();
      return new Response(JSON.stringify({ error: `HTTP ${res.status}: ${errText}` }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
