"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
export default function PublicBrowsingToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => { fetch('/api/public-browsing', { cache: 'no-store' }).then(r => r.json()).then(d => { setEnabled(d.enabled === true); setBusy(false); }).catch(() => setMessage('No se pudo cargar la configuración.')); }, []);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/public-browsing', { method: 'PUT', headers: { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEnabled(data.enabled); setMessage('Configuración guardada.');
    } catch { setMessage('No se pudo guardar. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 rounded-2xl border border-white/10 p-3 text-white"><button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={save} className="w-full text-left text-sm font-semibold disabled:opacity-50">Exploración pública de la página · {enabled ? 'Activada' : 'Desactivada'}</button><p className="mt-2 text-xs text-white/60">Permite que los visitantes exploren el catálogo, los precios y las funciones públicas sin iniciar sesión.</p><p role="status" className="mt-2 text-xs">{message}</p></div>;
}
