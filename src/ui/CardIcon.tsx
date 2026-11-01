import type { PanelCardIcon } from "@/ui/panel-nodes";

/**
 * The circular icon used by a record card.
 *
 * The host owns every path. A plugin only supplies one semantic name from the
 * `PanelCardIcon` whitelist.
 */
export function CardIcon({ name }: { name: PanelCardIcon }) {
  return (
    <span className="panel-card-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {name === "today" ? (
          <>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 9.75h17" />
            <path d="M8 3v3.5M16 3v3.5" />
          </>
        ) : name === "long" ? (
          <g fill="currentColor" stroke="none">
            {[0, 1, 2].map((line) =>
              [0, 1, 2].map((column) => (
                <rect
                  key={`${line}-${column}`}
                  x={3.6 + column * 6}
                  y={3.6 + line * 6}
                  width={4.6}
                  height={4.6}
                  rx={1.2}
                  opacity={0.32 + ((line + column) % 3) * 0.26}
                />
              )),
            )}
          </g>
        ) : name === "doc" ? (
          <>
            <path d="M6.5 3.5h7l4.5 4.5v12.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
            <path d="M13.5 3.5V8h4.5" />
            <path d="M8.5 13h7M8.5 16.5h4.5" />
          </>
        ) : name === "record" ? (
          <circle cx="12" cy="12" r="7.5" />
        ) : (
          <>
            <circle cx="12" cy="13.5" r="7" />
            <path d="M12 10.5v3.2l2.2 1.4" />
            <path d="M9.5 2.5h5" />
            <path d="M12 2.5v3.4" />
          </>
        )}
      </svg>
    </span>
  );
}
