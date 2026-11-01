"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";

const C = {
  border: "#D3D9F4",
  bg: "#FFFFFF",
  bgSoft: "#E9EDFF",
  text: "#12163A",
  textMuted: "#454B73",
  primary: "#2430E6",
  primaryGlow: "rgba(36,48,230,0.10)",
};

function ToolButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: 8,
        padding: "6px 9px",
        fontSize: 13,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        background: active ? C.primaryGlow : "transparent",
        color: active ? C.primary : C.textMuted,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "2px 4px" }} />;
}

/**
 * Editor visual estilo WordPress: o que se digita já aparece formatado
 * (negrito, títulos, listas, imagens inline etc.), sem precisar escrever
 * markdown à mão. Por baixo dos panos o conteúdo continua sendo salvo
 * como markdown (via lib/markdown-html.js), então o pipeline automático
 * de geração de posts continua funcionando exatamente como antes.
 */
export default function RichEditor({ html, onChangeHtml, onUploadImage, placeholder, minHeight = 360 }) {
  const isInternalUpdate = useRef(false);
  const [imageAlt, setImageAlt] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ HTMLAttributes: { style: "max-width:100%;border-radius:10px;" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder || "Comece a escrever o artigo…" }),
    ],
    content: html || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rich-editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChangeHtml(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      setImageAlt(editor.getAttributes("image").alt || "");
    },
  });

  // Sincroniza quando o HTML muda por fora (ex.: IA reescreveu o texto,
  // ou carregou um rascunho) — mas nunca durante a própria digitação,
  // senão o cursor "pula" a cada tecla.
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const current = editor.getHTML();
    if (html !== current) {
      editor.commands.setContent(html || "", false);
    }
  }, [html, editor]);

  async function handleImagePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    try {
      const url = await onUploadImage(file);
      if (url) editor.chain().focus().setImage({ src: url, alt: "" }).run();
    } catch {
      /* o pai já mostra o toast de erro */
    }
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("URL do link:", prev);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  if (!editor) return null;

  const words = editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.bg }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 2,
          padding: "8px 10px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bgSoft,
          position: "sticky",
          top: 56,
          zIndex: 1,
        }}
      >
        <ToolButton title="Desfazer" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↺</ToolButton>
        <ToolButton title="Refazer" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↻</ToolButton>
        <Divider />
        <ToolButton title="Parágrafo" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>P</ToolButton>
        <ToolButton title="Título 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolButton>
        <ToolButton title="Título 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolButton>
        <ToolButton title="Título 4" active={editor.isActive("heading", { level: 4 })} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>H4</ToolButton>
        <Divider />
        <ToolButton title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolButton>
        <ToolButton title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolButton>
        <ToolButton title="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolButton>
        <ToolButton title="Tachado" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolButton>
        <Divider />
        <ToolButton title="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>⇤</ToolButton>
        <ToolButton title="Centralizar" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>≡</ToolButton>
        <ToolButton title="Alinhar à direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>⇥</ToolButton>
        <Divider />
        <ToolButton title="Lista com marcadores" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Lista</ToolButton>
        <ToolButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Lista</ToolButton>
        <ToolButton title="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolButton>
        <ToolButton title="Bloco de código" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{"</>"}</ToolButton>
        <ToolButton title="Linha divisória" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</ToolButton>
        <Divider />
        <ToolButton title="Link" active={editor.isActive("link")} onClick={setLink}>🔗</ToolButton>
        <label
          title="Inserir imagem no texto"
          aria-label="Inserir imagem no texto"
          style={{ cursor: "pointer", padding: "6px 9px", borderRadius: 8, color: C.textMuted, fontSize: 13 }}
        >
          🖼️
          <input type="file" accept="image/*" onChange={handleImagePick} style={{ display: "none" }} />
        </label>
      </div>

      {editor.isActive("image") && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.bgSoft }}>
          <label htmlFor="editor-image-alt" style={{ display: "block", color: C.textMuted, fontSize: 12, marginBottom: 6 }}>
            Texto alternativo da imagem
          </label>
          <input
            id="editor-image-alt"
            value={imageAlt}
            onChange={(event) => {
              const alt = event.target.value;
              setImageAlt(alt);
              editor.commands.updateAttributes("image", { alt });
            }}
            placeholder="Descreva a imagem para leitores de tela e mecanismos de busca"
            style={{
              width: "100%",
              maxWidth: 560,
              padding: "8px 10px",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: C.bg,
              color: C.text,
              fontSize: 13,
            }}
          />
        </div>
      )}

      <div style={{ minHeight, maxHeight: 620, overflowY: "auto", padding: "18px 22px" }}>
        <EditorContent editor={editor} />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "6px 12px",
          borderTop: `1px solid ${C.border}`,
          background: C.bgSoft,
          color: C.textMuted,
          fontSize: 11,
        }}
      >
        {words} palavra{words === 1 ? "" : "s"}
      </div>
    </div>
  );
}
