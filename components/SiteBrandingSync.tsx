"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabase";

type SiteSettingsRow = {
  favicon_url: string | null;
};

export default function SiteBrandingSync() {
  useEffect(() => {
    loadFavicon();
  }, []);

  async function loadFavicon() {
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

    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }

    link.href = faviconUrl;
  }

  return null;
}