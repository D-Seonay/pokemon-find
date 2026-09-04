import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

const STYLES: Record<NonNullable<Props["variant"]>, string> = {
  primary: "bg-[var(--accent)] text-[#0a0b0f] font-extrabold",
  ghost: "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]",
  danger: "bg-[var(--danger)] text-white font-semibold",
};

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`rounded-[var(--radius-sm)] px-5 py-3 transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${STYLES[variant]} ${className}`}
    />
  );
}
