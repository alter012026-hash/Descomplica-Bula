"use client";

import { useEffect, useState } from "react";
import config from "../site.config";

const WELCOME_EMOJIS = ["🚀", "🎯", "📚", "🔥", "✨"];
const ROTATE_MS = 7000; // troca só o emoji, pra manter um respiro de "vivo" sem simular urgência

export default function WelcomeBanner({ postCount = 0, categoryCount = 0 }) {
  const [emojiIndex, setEmojiIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setEmojiIndex((i) => (i + 1) % WELCOME_EMOJIS.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="wcr-wrap">
      <div className="wcr-stage">
        <div className="wcr-slide wcr-slide--active">
          <div className="wm-wrap">
            <p className="wm-emoji">{WELCOME_EMOJIS[emojiIndex]}</p>
            <h2 className="wm-title">
              Bem-vindo ao <span>{config.name}</span>!
            </h2>
            <p className="wm-text">
              Seu próximo passo até a aprovação começa aqui.
              {postCount > 0 && (
                <>
                  {" "}Já são <strong>{postCount} artigos</strong>
                  {categoryCount > 0 && <> em <strong>{categoryCount} categorias</strong></>}
                  {" "}prontos pra te ajudar a estudar melhor e mais rápido.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
