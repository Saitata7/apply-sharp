/**
 * ApplySharp brand mark — concentric target rings + diagonal "sharp" arrow.
 * Two variants:
 *  - tinted (default): blue gradient chip with white reticle, used on light surfaces.
 *  - mono: monochrome, inherits currentColor — for dark sidebars or single-color contexts.
 */

interface LogoProps {
  size?: number;
  variant?: 'tinted' | 'mono';
  className?: string;
  title?: string;
}

export default function Logo({
  size = 28,
  variant = 'tinted',
  className,
  title = 'ApplySharp',
}: LogoProps): JSX.Element {
  if (variant === 'mono') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        fill="none"
        className={className}
        role="img"
        aria-label={title}
      >
        <circle cx="58" cy="70" r="34" stroke="currentColor" strokeWidth="6" opacity="0.32" />
        <circle cx="58" cy="70" r="22" stroke="currentColor" strokeWidth="6" opacity="0.75" />
        <circle cx="58" cy="70" r="7" fill="currentColor" />
        <path d="M58 70 L100 28" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M82 28 L100 28 L100 46"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const gradId = `as-bg-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0A66C2" />
          <stop offset="100%" stopColor="#004182" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill={`url(#${gradId})`} />
      <circle cx="58" cy="70" r="34" stroke="#FFFFFF" strokeWidth="6" opacity="0.32" />
      <circle cx="58" cy="70" r="22" stroke="#FFFFFF" strokeWidth="6" opacity="0.7" />
      <circle cx="58" cy="70" r="7" fill="#FFFFFF" />
      <path d="M58 70 L100 28" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
      <path
        d="M82 28 L100 28 L100 46"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
