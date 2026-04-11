"use client";

import { useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";

type SiteSettingsRow = {
  favicon_url: string | null;
};

// Componente silencioso que sincroniza branding o configuración visual del sitio al cargar la app.
export default function SiteBrandingSync() {
  const loadFavicon = useCallback(async () => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("favicon_url")
      .limit(1)
      .single();

    if (error) {
      console.error("Error cargando favicon:", error);
      return;
    }

    const row = data as SiteSettingsRow;
    const faviconUrl = row?.favicon_url || "";

    if (!faviconUrl) return;

    let link = document.querySelector(
      "link[rel='icon']"
    ) as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }

    link.href = faviconUrl;
  }, []);

  useEffect(() => {
    void loadFavicon();
  }, [loadFavicon]);

  return null;
}
