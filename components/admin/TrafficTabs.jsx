"use client";

import { useState } from "react";
import AnalyticsPanel, { CSS, Segmented } from "./AnalyticsPanel";
import VisitorsPanel from "./VisitorsPanel";

const VIEWS = [
  { value: "overview", label: "Visão geral" },
  { value: "visits", label: "Cada visita (com cookies)" },
];

/**
 * Aba Tráfego: "Visão geral" é a estatística anônima de todos os visitantes;
 * "Cada visita" mostra, em detalhe, só quem aceitou os cookies.
 */
export default function TrafficTabs() {
  const [view, setView] = useState("overview");
  return (
    <>
      <style>{CSS}</style>
      <div className="tp" style={{ marginBottom: 16 }}>
        <div>
          <Segmented light label="Tipo de relatório" options={VIEWS} value={view} onChange={setView} />
        </div>
      </div>
      {view === "overview" ? <AnalyticsPanel /> : <VisitorsPanel />}
    </>
  );
}
