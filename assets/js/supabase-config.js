// Fill these in once you've created your Supabase project - see
// SETUP_GUIDE.md, step 3, for exactly where to find them (Project
// Settings -> API). The anon/public key is safe to put here in plain
// text and commit to the repo, same as the old Apps Script URL was - it
// only grants whatever the row-level security policies in
// supabase/schema.sql allow, nothing more.
//
// Never put the "service_role" key here or anywhere in this repo - that
// key bypasses row-level security entirely. It's only ever used locally
// when running scripts/migrate_existing_teams.py once.

const SUPABASE_URL = "https://jpnuxomhyrwikqccbfic.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwbnV4b21oeXJ3aWtxY2NiZmljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTE0NjgsImV4cCI6MjEwMzc2NzQ2OH0.hUcQF6ttGhjwc7nf5Sw-fa6KBZKX6Ijx8p-LNeXWOrg";
