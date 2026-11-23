"use client";

type Props<T extends string> = { value: T; options: readonly T[]; onChange: (v: T) => void; label: string; format?: (o: T) => string; className?: string };

/** Mono segmented control. Buttons are real toggles (aria-pressed), so it is fully keyboard operable. */
export default function Segmented<T extends string>({ value, options, onChange, label, format, className = "" }: Props<T>) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onChange(o)}>
          {format ? format(o) : o}
        </button>
      ))}
    </div>
  );
}
