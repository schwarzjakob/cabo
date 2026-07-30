import { useCallback, useState } from "react";

interface CardProps {
  /** The value, if this client is currently entitled to see it. */
  value: number | null;
  empty?: boolean;
  selected?: boolean;
  highlighted?: boolean;
  small?: boolean;
  onSelect?: () => void;
  /**
   * Called the moment the card is pressed, before any value arrives — this is
   * what spends a peek, so that holding a card *is* looking at it rather than
   * a separate step.
   */
  onHold?: () => void;
}

/**
 * A face-down card that shows its value only while held. Press and hold to
 * look, release to hide — the clock keeps running while you look, which is the
 * whole cost of remembering.
 */
export function Card({
  value,
  empty = false,
  selected = false,
  highlighted = false,
  small = false,
  onSelect,
  onHold,
}: CardProps) {
  const [held, setHeld] = useState(false);

  const hold = useCallback(() => {
    setHeld(true);
    onHold?.();
  }, [onHold]);
  const release = useCallback(() => setHeld(false), []);

  if (empty) {
    return <div className={`card card--empty ${small ? "card--small" : ""}`} />;
  }

  const showing = held && value !== null;

  return (
    <button
      type="button"
      className={[
        "card",
        small ? "card--small" : "",
        showing ? "card--face-up" : "",
        selected ? "card--selected" : "",
        highlighted ? "card--highlighted" : "",
        value !== null ? "card--knowable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onSelect}
    >
      <span className="card__face">{showing ? value : ""}</span>
      {value !== null && !showing ? <span className="card__known" /> : null}
    </button>
  );
}
