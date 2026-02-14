import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("BYOK migration smoke checks", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260214170000_user_api_keys_modernize.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("includes store state consistency constraint", () => {
    expect(sql).toContain("user_api_keys_store_state_check");
    expect(sql).toContain("store_key = true");
    expect(sql).toContain("store_key = false");
    expect(sql).toContain("encrypted_key IS NOT NULL");
    expect(sql).toContain("encrypted_key IS NULL");
  });

  it("removes legacy last_four usage from canonical table schema", () => {
    expect(sql).toContain("DROP COLUMN IF EXISTS last_four");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS key_last4");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS store_key");
  });
});
