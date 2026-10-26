import type { ReactNode } from 'react';

export function Card(props: { children: ReactNode }) {
  return <div className="shiki-card">{props.children}</div>;
}

export function Chip(props: {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="shiki-chip"
      data-selected={props.selected ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
