// Pro layer only (PLAN 2.8): pretty read-only rendering of an enum value.
// Core never imports this. Edit mode stays a Select; view mode swaps to
// Pretty automatically — the caller does not write a ternary in JSX.
// Colour mapping is the pro.formily ProEnum idea, rewritten for Shiki:
// status-like values map to colours, everything else falls back to default.
import type { EnumOption } from '../core/enum';

export const STATUS_COLORS: Record<string, string> = {
  success: '#16a34a',
  processing: '#2563eb',
  error: '#dc2626',
  warning: '#d97706',
  default: '#6b7280',
  active: '#16a34a',
  disabled: '#6b7280',
  pending: '#d97706',
};

/** Resolve the colour for an option: explicit option.color wins, then the
 *  status map keyed by value or by option.color, then default grey. */
export function colorForOption(option: EnumOption | undefined): string {
  if (!option) return STATUS_COLORS.default;
  if (option.color && STATUS_COLORS[option.color]) return STATUS_COLORS[option.color];
  if (option.color) return option.color;
  return STATUS_COLORS[String(option.value)] ?? STATUS_COLORS.default;
}

export function ProEnumPretty(props: {
  value: string | number | undefined;
  options: EnumOption[];
  colorMap?: Record<string, string>;
}) {
  const option = props.options.find((o) => o.value === props.value);
  const colors = { ...STATUS_COLORS, ...(props.colorMap ?? {}) };
  const color = option?.color && colors[option.color] ? colors[option.color] : colors[String(option?.value)] ?? colors.default;
  if (!option) return <span className="shiki-muted">—</span>;
  return (
    <span
      style={{
        display: 'inline-block',
        border: `1px solid ${color}`,
        color,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 13,
      }}
    >
      {option.label}
    </span>
  );
}
