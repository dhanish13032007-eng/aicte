"use client";

/** Original product mark — an abstract institutional emblem (not an official
 * government seal; see branding note in README). */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="AICTE Approval Operations Intelligence prototype mark"
      className="shrink-0"
    >
      <rect x="1.5" y="1.5" width="45" height="45" rx="7" fill="#12345A" stroke="#0E2743" strokeWidth="1.5" />
      {/* stylised knowledge structure: pediment + columns */}
      <path d="M24 8 L40 17 H8 Z" fill="#E87524" />
      <rect x="10" y="20" width="4" height="17" fill="#FFFFFF" opacity="0.92" />
      <rect x="22" y="20" width="4" height="17" fill="#FFFFFF" opacity="0.92" />
      <rect x="34" y="20" width="4" height="17" fill="#FFFFFF" opacity="0.92" />
      <rect x="7" y="39" width="34" height="3.4" rx="1.2" fill="#FFFFFF" opacity="0.78" />
    </svg>
  );
}
