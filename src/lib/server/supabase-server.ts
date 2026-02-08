import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServiceEnv } from "@/lib/server/env";

const getBearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
};

export const createSupabaseServerClient = (
  accessToken?: string
): SupabaseClient => {
  const { url, anonKey } = getSupabasePublicEnv();
  return createClient(url, anonKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

let adminClient: SupabaseClient | null = null;

export const getSupabaseAdminClient = (): SupabaseClient => {
  if (adminClient) return adminClient;
  const { url, serviceRoleKey } = getSupabaseServiceEnv();
  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return adminClient;
};

export const requireRequestUser = async (
  request: Request
): Promise<{ accessToken: string; user: User; supabase: SupabaseClient }> => {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new Error("UNAUTHORIZED");
  }

  const supabase = createSupabaseServerClient(accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  return { accessToken, user, supabase };
};
