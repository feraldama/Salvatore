"use client";

import type { MouseEventHandler, ComponentType } from "react";

interface ActionButtonProps {
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export default function ActionButton({
  label,
  onClick,
  icon: Icon,
  className = "",
  disabled = false,
  type = "button",
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      type={type}
      className={`flex items-center gap-2 px-4 py-2 bg-brand-700 rounded-lg whitespace-nowrap transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        className ? className : "text-white"
      } ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-brand-800 cursor-pointer"
      }`}
      disabled={disabled}
    >
      {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
      {label}
    </button>
  );
}
