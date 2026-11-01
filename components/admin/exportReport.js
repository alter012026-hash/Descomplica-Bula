/**
 * Baixa o relatório de tráfego gerado em /api/admin/export.
 * Usa fetch (e não um link direto) para mostrar a mensagem de erro no painel
 * em vez de abrir uma página de JSON quando a sessão expirou ou algo falhou.
 */
export async function downloadTrafficReport({ range, format = "xlsx" }) {
  const response = await fetch(`/api/admin/export?range=${range}&format=${format}`, { cache: "no-store" });
  if (!response.ok) {
    let message = "Falha ao gerar o relatório.";
    try { message = (await response.json()).error || message; } catch { /* resposta sem JSON */ }
    throw new Error(response.status === 401 ? "Sessão expirada: entre novamente no admin." : message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const name = (disposition.match(/filename="([^"]+)"/) || [])[1] || `trafego-${range}d.${format}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
