import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("BYOK audit/health migration smoke checks", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260214200000_byok_audit_and_health.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("adds validation metadata columns to user_api_keys", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS encryption_kid");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS last_validated_at");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS last_validation_status");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS last_validation_error");
  });

  it("creates BYOK audit table and RLS policies", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_api_key_audit_events");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("Users can view their own BYOK audit events");
    expect(sql).toContain("Users can insert their own BYOK audit events");
  });
});
