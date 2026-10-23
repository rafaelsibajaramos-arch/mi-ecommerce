import { createSupabaseAdmin } from './supabaseAdmin';

export async function publicBrowsingEnabled(): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdmin().from('site_settings').select('value').eq('key', 'public_browsing_enabled').maybeSingle();
    return !error && data?.value === true;
  } catch { return false; }
}
