"use client";

import { useEffect } from "react";
import { trackSiteEvent } from "../lib/analytics-events";

export default function AnalyticsEvents() {
  useEffect(() => {
    function handleClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("[data-analytics-event]");
      if (!link) return;

      const name = link.dataset.analyticsEvent;
      if (name === "outbound_official_source_click") {
        trackSiteEvent(name, { source_domain: link.dataset.sourceDomain || "unknown" });
      } else if (name === "affiliate_click") {
        trackSiteEvent(name, {
          partner_id: link.dataset.partnerId || "unknown",
          page_slug: link.dataset.pageSlug || "unknown",
        });
      } else if (name === "related_article_click") {
        trackSiteEvent(name, { target_slug: link.dataset.targetSlug || "unknown" });
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
