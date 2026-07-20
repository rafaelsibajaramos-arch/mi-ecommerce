"use client";

import { useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";

type SiteSettingsRow = { favicon_url: string | null };

const CACHE_KEY = "streamingmayor_favicon_cache_v1";
const CACHE_MS = 24 * 60 * 60 * 1000;

function applyFavicon(url: string) {
  if (!url) return;
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export default function SiteBrandingSync() {
  const loadFavicon = useCallback(async () => {
    try {
      const cachedRaw = window.localStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { url?: string; savedAt?: number };
        if (cached.url) applyFavicon(cached.url);
        if (cached.savedAt && Date.now() - cached.savedAt < CACHE_MS) return;
      }
    } catch {}

    const { data, error } = await supabase
      .from("site_settings")
      .select("favicon_url")
      .limit(1)
      .maybeSingle();

    if (error || !data) return;
    const url = (data as SiteSettingsRow).favicon_url || "";
    if (!url) return;
    applyFavicon(url);

    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ url, savedAt: Date.now() }));
    } catch {}
  }, []);

  useEffect(() => {
    void loadFavicon();
  }, [loadFavicon]);

  return null;
}
