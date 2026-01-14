import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "#frontend/lib/cn.ts";

interface ClickToCopyProps {
  readonly value: string;
  readonly label?: string;
  readonly className?: string;
}

export function ClickToCopy({ value, label, className }: ClickToCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono transition-colors hover:text-primary cursor-pointer",
        className
      )}
      title={`Click to copy ${label || "value"}`}
    >
      <span>{value}</span>
      {copied ? (
        <CheckIcon className="size-4 text-success" />
      ) : (
        <CopyIcon className="size-3.5 opacity-50 group-hover:opacity-100" />
      )}
    </button>
  );
}
