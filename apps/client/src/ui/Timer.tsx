import { useEffect, useState } from "react";
import type { TimerView } from "@cabo/protocol";

interface TimerProps {
  timer: TimerView | null;
  total: number;
  label: string;
}

export function Timer({ timer, total, label }: TimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(handle);
  }, []);

  if (!timer) return null;

  const remaining = Math.max(0, timer.endsAt - now);
  const seconds = Math.ceil(remaining / 1000);
  const fraction = Math.max(0, Math.min(1, remaining / (total * 1000)));

  return (
    <div className="timer">
      <div className="timer__label">
        {label} <strong>{seconds}s</strong>
      </div>
      <div className="timer__track">
        <div
          className={`timer__fill ${fraction < 0.25 ? "timer__fill--low" : ""}`}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
    </div>
  );
}
