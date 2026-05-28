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
      <style>{`
        .sp-group { transform-origin: center; animation: sp-rotate 2s linear infinite; }
        .sp-group circle { stroke-linecap: round; animation: sp-dash 1.5s ease-in-out infinite; }
        @keyframes sp-rotate { 100% { transform: rotate(360deg); } }
        @keyframes sp-dash {
          0%          { stroke-dasharray: 0 150;  stroke-dashoffset: 0;   }
          47.5%       { stroke-dasharray: 42 150; stroke-dashoffset: -16; }
          95%, 100%   { stroke-dasharray: 42 150; stroke-dashoffset: -59; }
        }
      `}</style>
      <g className="sp-group">
        <circle cx="12" cy="12" r="9.5" strokeWidth="3" />
      </g>
    </svg>
  );
}
