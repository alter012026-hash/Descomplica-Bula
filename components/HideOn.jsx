"use client";

import { usePathname } from "next/navigation";

/** Esconde o conteúdo (ex.: rodapé) em rotas "modo foco" como /admin. */
export default function HideOn({ paths = [], children }) {
  const pathname = usePathname() || "";
  if (paths.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;
  return children;
}
