export function TextInput({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="text-input" {...props} />
    </label>
  );
}
