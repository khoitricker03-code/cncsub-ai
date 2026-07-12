import type { PointerEventHandler } from "react";

export default function TimelineResizeHandle({
  edge,
  onPointerDown,
}: {
  edge: "left" | "right";
  onPointerDown: PointerEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={[
        "absolute inset-y-0 z-20 w-2 cursor-ew-resize touch-none bg-white/20 opacity-0 transition-opacity group-hover:opacity-100",
        edge === "left" ? "left-0" : "right-0",
      ].join(" ")}
      onPointerDown={onPointerDown}
      aria-hidden="true"
    />
  );
}
