import Link from "next/link";
import config from "../site.config";
import Logo from "./Logo";
import NewsletterBox from "./NewsletterBox";
import { CookiePrefsButton } from "./ConsentBanner";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p className="footer-tagline">{config.tagline}</p>
          </div>

          <div className="footer-cols">
            <nav aria-label="Explorar">
              <p className="footer-col-title">Explorar</p>
              <div className="footer-nav">
                {config.navigation.map((item) => (
                  <Link key={item.href} href={item.href} className="footer-link">{item.label}</Link>
                ))}
              </div>
            </nav>
            <nav aria-label="Institucional">
              <p className="footer-col-title">Sobre o projeto</p>
              <div className="footer-nav">
                {config.footerNavigation.map((item) => (
                  <Link key={item.href} href={item.href} className="footer-link">{item.label}</Link>
                ))}
              </div>
            </nav>
          </div>

          <div className="footer-newsletter">
            <NewsletterBox />
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">
            © {year} {config.name}. Todos os direitos reservados.
            <CookiePrefsButton className="footer-linkbtn" />
          </p>
        </div>
      </div>
      <span className="footer-wordmark" aria-hidden="true">{config.name}</span>
    </footer>
  );
}
