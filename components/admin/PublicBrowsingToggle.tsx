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
  return <div className="mx-2 mt-6 border-t border-white/[0.07] pt-5">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs font-medium tracking-wide text-white/75">Exploración pública</p><p className="mt-1 text-[10px] text-white/35">{busy ? 'Actualizando…' : enabled ? 'Activada' : 'Desactivada'}</p></div>
      <button type="button" role="switch" aria-label="Exploración pública de la página" aria-checked={enabled} disabled={busy} onClick={save} className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40 ${enabled ? 'border-emerald-400/30 bg-emerald-400/20' : 'border-white/10 bg-white/[0.06]'}`}><span className={`h-4 w-4 rounded-full shadow-sm transition-transform duration-300 ${enabled ? 'translate-x-[18px] bg-emerald-300' : 'translate-x-[2px] bg-slate-400'}`} /></button>
    </div>
    <p className="mt-3 text-[11px] leading-relaxed text-white/35">Permite explorar el catálogo y los precios sin iniciar sesión.</p>
    <p role="status" className="mt-2 min-h-4 text-[10px] text-white/55">{message}</p>
  </div>;
}
