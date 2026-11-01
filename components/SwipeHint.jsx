export default function SwipeHint({ children }) {
  return (
    <p className="swipe-hint">
      <span>{children}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </svg>
    </p>
  );
}
