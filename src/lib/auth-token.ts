import { supabase } from "@/integrations/supabase/client";

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }
  return data.session?.access_token ?? null;
}

export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Authentication required");
  }

  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
