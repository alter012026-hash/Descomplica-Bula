import { NextResponse } from "next/server";
import { checkAdminAuth } from "../../../../../lib/admin-auth";
import { commitBinaryFile } from "../../../../../lib/github-commit";
import { slugify } from "../../../../../lib/article-generator";

function getExtension(fileName = "", mimeType = "") {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (ext) return ext;

  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpg") || mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("svg")) return "svg";
  return "png";
}

export async function POST(request) {
  if (!checkAdminAuth()) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { fileName, mimeType, contentBase64 } = await request.json();
    if (!contentBase64 || !fileName) {
      return NextResponse.json({ error: "Imagem e nome do arquivo são obrigatórios." }, { status: 400 });
    }

    const cleanBase64 = String(contentBase64).replace(/^data:[^;]+;base64,/, "").trim();
    const ext = getExtension(fileName, mimeType);
    const targetPath = `public/images/manual-${Date.now()}-${slugify(fileName.replace(/\.[^.]+$/, ""))}.${ext}`;

    await commitBinaryFile(
      targetPath,
      cleanBase64,
      `🖼️ Upload de imagem manual: ${targetPath}`
    );

    return NextResponse.json({
      ok: true,
      url: `/${targetPath.replace(/^public\//, "")}`,
    });
  } catch (err) {
    console.error("[admin/manual-post/upload-image]", err);
    return NextResponse.json({ error: err.message || "Erro ao subir a imagem." }, { status: 500 });
  }
}
