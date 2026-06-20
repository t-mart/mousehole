import { cn } from "#frontend/lib/cn.ts";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5 text-white", className)}
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      fill="none"
    >
      <g className="spinner-group">
        <circle
          cx="12"
          cy="12"
          r="9.5"
          strokeWidth="3"
          className="spinner-circle"
        />
      </g>
    </svg>
  );
}
