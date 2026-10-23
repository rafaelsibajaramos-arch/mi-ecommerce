import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { publicBrowsingEnabled } from '@/lib/publicBrowsing';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({ enabled: await publicBrowsingEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: { user }, error } = await auth.auth.getUser(token);
    if (error || !user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    const admin = createSupabaseAdmin();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    const body = await request.json();
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    const { error: saveError } = await admin.from('site_settings').upsert({ key: 'public_browsing_enabled', value: body.enabled });
    if (saveError) throw saveError;
    return NextResponse.json({ enabled: body.enabled });
  } catch { return NextResponse.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 }); }
}
