"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import config from "../site.config";

export default function AdSenseScript({ enabled }) {
  const pathname = usePathname();

  useEffect(() => {
    const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
    const scriptId = "google-adsense-script";
    const existingScript = document.getElementById(scriptId);

    if (
      isAdminRoute ||
      !enabled ||
      !config.adsense.enabled ||
      config.adsense.publisherId === "ca-pub-XXXXXXXXXXXXXXXX"
    ) {
      existingScript?.remove();
      return;
    }

    if (existingScript) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.adsense.publisherId}`;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [pathname]);

  return null;
}
