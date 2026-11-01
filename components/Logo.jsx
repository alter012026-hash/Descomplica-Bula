import Link from "next/link";
import config from "../site.config";

export function LogoMark({ className = "logo-mark" }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <rect className="lm-bg" x="5" y="12" width="30" height="16" rx="8" transform="rotate(-35 20 20)" />
      <path className="lm-tick" d="m18 7 9 13-9 13" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo({ onClick, label = true }) {
  const [first, ...rest] = config.name.split(" ");
  return (
    <Link href="/" className="logo" onClick={onClick} aria-label={config.name}>
      <LogoMark />
      {label && (
        <span className="logo-text">
          <span className="logo-name">{first}</span>
          <span className="logo-sub">{rest.join(" ").toLowerCase() || config.niche}</span>
        </span>
      )}
    </Link>
  );
}
