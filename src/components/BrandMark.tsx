export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand-lockup brand-lockup-compact" : "brand-lockup"}>
      <svg
        className="brand-orb"
        viewBox="0 0 32 32"
        width={32}
        height={32}
        aria-hidden
      >
        <path
          fill="#E6FF00"
          fillRule="evenodd"
          clipRule="evenodd"
          d="M13 1.25a11.75 11.75 0 1 1 0 23.5 11.75 11.75 0 1 1 0-23.5ZM13 7.1a5.9 5.9 0 1 0 0 11.8 5.9 5.9 0 0 0 0-11.8Z"
        />
        <path
          fill="#E6FF00"
          d="M20.2 18.9a2.45 2.45 0 0 1 3.47 0l6.16 6.16a2.45 2.45 0 0 1-3.47 3.46L20.2 22.37a2.45 2.45 0 0 1 0-3.47Z"
        />
      </svg>
      <span className="brand-word">
        Find Hidden <em>Money</em>
      </span>
    </span>
  );
}
