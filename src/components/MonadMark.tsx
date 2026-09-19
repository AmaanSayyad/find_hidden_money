type Props = {
  size?: number;
  className?: string;
  /** Official purple tile, or white ring for dark fills. */
  variant?: "mark" | "logomark";
};

export function MonadMark({
  size = 28,
  className,
  variant = "mark",
}: Props) {
  const src = variant === "logomark" ? "/monad/logomark.svg" : "/monad/mark.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className ? `monad-mark ${className}` : "monad-mark"}
      src={src}
      alt=""
      width={size}
      height={size}
    />
  );
}
