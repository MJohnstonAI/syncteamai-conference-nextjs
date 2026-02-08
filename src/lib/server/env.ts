import "server-only";

type OptionalEnv = string | undefined;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const getSupabasePublicEnv = () => ({
  url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  anonKey: requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
});

export const getOpenRouterBaseUrl = () =>
  (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    ""
  );

export const getOpenRouterHeaders = () => {
  const referer = process.env.OPENROUTER_REFERER;
  const title = process.env.OPENROUTER_TITLE;

  return {
    referer,
    title,
  };
};

export const getByokEncryptionSecret = (): string =>
  requireEnv("BYOK_ENCRYPTION_KEY");

export const getUpstashEnv = (): {
  url: OptionalEnv;
  token: OptionalEnv;
} => ({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
