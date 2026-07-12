import type { PointerEventHandler } from "react";

export default function TimelineDragHandle({
  onPointerDown,
}: {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className="absolute inset-y-0 left-2 right-2 cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      aria-hidden="true"
    />
  );
}
