export type StatusIconName = "office" | "home" | "vacation" | "holiday" | "eligible";

export function StatusIcon({ type }: { type: StatusIconName }) {
  const common = { className: `status-icon status-icon-${type}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  if (type === "office") {
    return <svg {...common}><path d="M4 21V5.5L12 3l8 2.5V21" /><path d="M8 8h1M8 12h1M8 16h1M15 8h1M15 12h1M15 16h1M10 21v-3h4v3" /></svg>;
  }
  if (type === "home") {
    return <svg {...common}><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6" /></svg>;
  }
  if (type === "vacation") {
    return <svg {...common}><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7M3.5 12h17M10 12v2h4v-2" /></svg>;
  }
  if (type === "holiday") {
    return <svg {...common}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>;
  }
  return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12h8M12 8v8" /></svg>;
}
