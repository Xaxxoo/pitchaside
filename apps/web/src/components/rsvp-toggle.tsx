'use client';

/** An on/off row with a title and a line on what it does, for the create and edit group forms. */
export function SwitchRow({
  checked,
  onChange,
  name,
  title,
  sub,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  /** Set for uncontrolled use inside a <form> (reads as "on" when checked). */
  name?: string;
  title: string;
  sub: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 cursor-pointer has-[:checked]:border-ink has-[:checked]:bg-volt-100">
      <input
        type="checkbox"
        role="switch"
        name={name}
        {...(onChange ? { checked, onChange: (e) => onChange(e.target.checked) } : { defaultChecked: checked })}
        className="peer sr-only"
      />
      <span className="relative mt-0.5 w-10 h-6 rounded-full bg-gray-300 peer-checked:bg-ink peer-focus-visible:ring-4 peer-focus-visible:ring-volt-300/70 transition-colors shrink-0 after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-volt-400" />
      <span>
        <span className="block text-sm font-bold text-ink">{title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{sub}</span>
      </span>
    </label>
  );
}

/** "Players confirm each game" switch used on the create and edit group forms. */
export function RsvpToggle(props: { checked?: boolean; onChange?: (v: boolean) => void; name?: string }) {
  return (
    <SwitchRow
      {...props}
      title="Players confirm each game"
      sub="Players tap “I’m in”. A full game gets a waitlist; only players in owe."
    />
  );
}
