import { createSupabaseAdmin } from './supabaseAdmin';

export async function publicBrowsingEnabled(): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdmin().from('site_settings').select('public_browsing_enabled').limit(1).maybeSingle();
    return !error && data?.public_browsing_enabled === true;
  } catch { return false; }
}
