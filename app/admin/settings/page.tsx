"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";


type SiteSettingsRow = {
  id: string;
  timezone: string;
  navbar_logo_url: string | null;
  favicon_url: string | null;
  navbar_logo_width_desktop: number | null;
  navbar_logo_height_desktop: number | null;
  navbar_logo_width_mobile: number | null;
  navbar_logo_height_mobile: number | null;
};

export default function AdminSettingsPage() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Bogota");

  const [navbarLogoFile, setNavbarLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);

  const [navbarLogoPreview, setNavbarLogoPreview] = useState("");
  const [faviconPreview, setFaviconPreview] = useState("");

  const [currentNavbarLogo, setCurrentNavbarLogo] = useState("");
  const [currentFavicon, setCurrentFavicon] = useState("");

  const [logoWidthDesktop, setLogoWidthDesktop] = useState(290);
  const [logoHeightDesktop, setLogoHeightDesktop] = useState(46);
  const [logoWidthMobile, setLogoWidthMobile] = useState(180);
  const [logoHeightMobile, setLogoHeightMobile] = useState(34);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("site_settings")
      .select(
        "id, timezone, navbar_logo_url, favicon_url, navbar_logo_width_desktop, navbar_logo_height_desktop, navbar_logo_width_mobile, navbar_logo_height_mobile"
      )
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error cargando ajustes:", error);
      setMessage("No se pudieron cargar los ajustes.");
      setLoading(false);
      return;
    }

    const row = data?.[0] as SiteSettingsRow | undefined;

    if (!row) {
      const { data: inserted, error: insertError } = await supabase
        .from("site_settings")
        .insert({
          timezone: "America/Bogota",
          navbar_logo_width_desktop: 290,
          navbar_logo_height_desktop: 46,
          navbar_logo_width_mobile: 180,
          navbar_logo_height_mobile: 34,
        })
        .select(
          "id, timezone, navbar_logo_url, favicon_url, navbar_logo_width_desktop, navbar_logo_height_desktop, navbar_logo_width_mobile, navbar_logo_height_mobile"
        )
        .single();

      if (insertError || !inserted) {
        console.error("Error creando ajustes iniciales:", insertError);
        setMessage("No se pudo crear el registro inicial de ajustes.");
        setLoading(false);
        return;
      }

      setSettingsId(inserted.id);
      setTimezone(inserted.timezone || "America/Bogota");
      setCurrentNavbarLogo(inserted.navbar_logo_url || "");
      setCurrentFavicon(inserted.favicon_url || "");
      setNavbarLogoPreview(inserted.navbar_logo_url || "");
      setFaviconPreview(inserted.favicon_url || "");
      setLogoWidthDesktop(inserted.navbar_logo_width_desktop || 290);
      setLogoHeightDesktop(inserted.navbar_logo_height_desktop || 46);
      setLogoWidthMobile(inserted.navbar_logo_width_mobile || 180);
      setLogoHeightMobile(inserted.navbar_logo_height_mobile || 34);
      setLoading(false);
      return;
    }

    setSettingsId(row.id);
    setTimezone(row.timezone || "America/Bogota");
    setCurrentNavbarLogo(row.navbar_logo_url || "");
    setCurrentFavicon(row.favicon_url || "");
    setNavbarLogoPreview(row.navbar_logo_url || "");
    setFaviconPreview(row.favicon_url || "");
    setLogoWidthDesktop(row.navbar_logo_width_desktop || 290);
    setLogoHeightDesktop(row.navbar_logo_height_desktop || 46);
    setLogoWidthMobile(row.navbar_logo_width_mobile || 180);
    setLogoHeightMobile(row.navbar_logo_height_mobile || 34);
    setLoading(false);
  }

  function handleNavbarLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setNavbarLogoFile(file);

    if (file) {
      setNavbarLogoPreview(URL.createObjectURL(file));
    } else {
      setNavbarLogoPreview(currentNavbarLogo || "");
    }
  }

  function handleFaviconChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setFaviconFile(file);

    if (file) {
      setFaviconPreview(URL.createObjectURL(file));
    } else {
      setFaviconPreview(currentFavicon || "");
    }
  }

  async function uploadFile(file: File, folder: string) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `${folder}-${Date.now()}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("site-assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("site-assets").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();

    if (!settingsId) {
      setMessage("No se encontró el registro de ajustes.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      let navbarLogoUrl = currentNavbarLogo || null;
      let faviconUrl = currentFavicon || null;

      if (navbarLogoFile) {
        navbarLogoUrl = await uploadFile(navbarLogoFile, "navbar");
      }

      if (faviconFile) {
        faviconUrl = await uploadFile(faviconFile, "favicon");
      }

      const { error } = await supabase
        .from("site_settings")
        .update({
          timezone,
          navbar_logo_url: navbarLogoUrl,
          favicon_url: faviconUrl,
          navbar_logo_width_desktop: logoWidthDesktop,
          navbar_logo_height_desktop: logoHeightDesktop,
          navbar_logo_width_mobile: logoWidthMobile,
          navbar_logo_height_mobile: logoHeightMobile,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId);

      if (error) throw error;

      setCurrentNavbarLogo(navbarLogoUrl || "");
      setCurrentFavicon(faviconUrl || "");
      setNavbarLogoPreview(navbarLogoUrl || "");
      setFaviconPreview(faviconUrl || "");
      setNavbarLogoFile(null);
      setFaviconFile(null);
      setMessage("Ajustes guardados correctamente.");
    } catch (error) {
      console.error("Error guardando ajustes:", error);
      setMessage("No se pudieron guardar los ajustes.");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setTimezone("America/Bogota");
    setNavbarLogoFile(null);
    setFaviconFile(null);
    setNavbarLogoPreview(currentNavbarLogo || "");
    setFaviconPreview(currentFavicon || "");
    setLogoWidthDesktop(290);
    setLogoHeightDesktop(46);
    setLogoWidthMobile(180);
    setLogoHeightMobile(34);
    setMessage("");
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
            Administración
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
            Ajustes
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Configura la zona horaria, la identidad visual y el tamaño del logo.
          </p>
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-slate-600">Cargando ajustes...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">
                  Configuración general
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ajustes base del funcionamiento del sitio.
                </p>

                <div className="mt-6 space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Zona horaria
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    >
                      <option value="America/Bogota">America/Bogota</option>
                      <option value="America/Mexico_City">America/Mexico_City</option>
                      <option value="America/Lima">America/Lima</option>
                      <option value="America/Santiago">America/Santiago</option>
                      <option value="America/Argentina/Buenos_Aires">
                        America/Argentina/Buenos_Aires
                      </option>
                      <option value="Europe/Madrid">Europe/Madrid</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">
                  Identidad visual
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Sube el logo principal y el icono de la pestaña.
                </p>

                <div className="mt-6 space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Logo de la navbar
                    </label>

                    <label className="flex min-h-[120px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:bg-slate-100">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleNavbarLogoChange}
                        className="hidden"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {navbarLogoFile
                            ? navbarLogoFile.name
                            : "Haz clic para subir el logo"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          PNG, JPG, WEBP o SVG
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Favicon de la pestaña
                    </label>

                    <label className="flex min-h-[120px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:bg-slate-100">
                      <input
                        type="file"
                        accept="image/*,.ico"
                        onChange={handleFaviconChange}
                        className="hidden"
                      />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {faviconFile
                            ? faviconFile.name
                            : "Haz clic para subir el favicon"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Recomendado: PNG o ICO cuadrado
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">
                Tamaño del logo
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ajusta el tamaño del logo para móvil y escritorio cuando quieras.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Ancho desktop
                  </label>
                  <input
                    type="number"
                    min={80}
                    value={logoWidthDesktop}
                    onChange={(e) => setLogoWidthDesktop(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Alto desktop
                  </label>
                  <input
                    type="number"
                    min={20}
                    value={logoHeightDesktop}
                    onChange={(e) => setLogoHeightDesktop(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Ancho móvil
                  </label>
                  <input
                    type="number"
                    min={60}
                    value={logoWidthMobile}
                    onChange={(e) => setLogoWidthMobile(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Alto móvil
                  </label>
                  <input
                    type="number"
                    min={20}
                    value={logoHeightMobile}
                    onChange={(e) => setLogoHeightMobile(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">Vista previa</h2>
              <p className="mt-1 text-sm text-slate-500">
                Aquí verás cómo quedarían los archivos seleccionados.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Zona horaria
                  </p>
                  <p className="mt-2 break-all text-sm font-semibold text-slate-900">
                    {timezone}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Logo navbar
                  </p>
                  <div className="mt-3 flex min-h-[90px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-3">
                    {navbarLogoPreview ? (
                      <img
                        src={navbarLogoPreview}
                        alt="Vista previa logo navbar"
                        className="object-contain"
                        style={{
                          width: `${logoWidthMobile}px`,
                          height: `${logoHeightMobile}px`,
                          maxWidth: "100%",
                        }}
                      />
                    ) : (
                      <span className="text-sm text-slate-400">
                        Sin imagen seleccionada
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Favicon
                  </p>
                  <div className="mt-3 flex min-h-[90px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-3">
                    {faviconPreview ? (
                      <img
                        src={faviconPreview}
                        alt="Vista previa favicon"
                        className="h-10 w-10 object-contain"
                      />
                    ) : (
                      <span className="text-sm text-slate-400">
                        Sin imagen seleccionada
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {message && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {message}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-[#08111f] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar ajustes"}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Restablecer
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}