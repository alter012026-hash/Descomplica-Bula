"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Barra de progresso de leitura animada com milestones e indicador flutuante.
 */
export default function ReadProgressEnhanced() {
  const [progress, setProgress] = useState(0);
  const [milestoneReached, setMilestoneReached] = useState(null);
  const [showBadge, setShowBadge] = useState(false);
  const milestones = useRef(new Set());
  const badgeTimer = useRef(null);

  const MILESTONES = [
    { pct: 25, label: "25% lido 🔥" },
    { pct: 50, label: "Metade! ⚡" },
    { pct: 75, label: "Quase lá! 💪" },
    { pct: 100, label: "Concluído! 🎉" },
  ];

  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement;
      const scrollTop = doc.scrollTop || document.body.scrollTop;
      const scrollHeight =
        (doc.scrollHeight || document.body.scrollHeight) - doc.clientHeight;
      const pct =
        scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
      const clamped = Math.min(100, Math.max(0, pct));
      setProgress(clamped);

      for (const m of MILESTONES) {
        if (clamped >= m.pct && !milestones.current.has(m.pct)) {
          milestones.current.add(m.pct);
          setMilestoneReached(m.label);
          setShowBadge(true);
          clearTimeout(badgeTimer.current);
          badgeTimer.current = setTimeout(() => setShowBadge(false), 2200);
        }
      }
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(badgeTimer.current);
    };
  }, []);

  // color interpolated green → accent based on progress
  const hue = Math.round(130 - progress * 0.4); // subtle shift

  return (
    <>
      {/* Barra principal no topo */}
      <div className="rp-bar" aria-hidden="true">
        <div
          className="rp-fill"
          style={{ width: `${progress}%`, filter: `hue-rotate(${hue - 130}deg)` }}
        />
        {/* Bolinha indicadora */}
        <div
          className="rp-dot"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
      </div>

      {/* Badge flutuante de milestone */}
      <div className={`rp-badge${showBadge ? " rp-badge--visible" : ""}`} role="status" aria-live="polite">
        {milestoneReached}
      </div>

      {/* Percentual fixo no canto */}
      {progress > 2 && progress < 99 && (
        <div className="rp-pct" aria-label={`${Math.round(progress)}% lido`}>
          {Math.round(progress)}%
        </div>
      )}
    </>
  );
}
