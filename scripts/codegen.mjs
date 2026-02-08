#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const target = fileURLToPath(new URL('../src/integrations/supabase/types.ts', import.meta.url));

try {
  await access(target);
  console.log('codegen: Supabase types file present – manual sync only.');
} catch (error) {
  console.error('codegen: missing Supabase types at', target);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
