import { createContext, useContext, type ReactNode } from 'react';
import type { FieldView, ShikiForm } from '@shikiform/core';

export const FormContext = createContext<ShikiForm | null>(null);
export const ScopeContext = createContext('');
export const RegionContext = createContext<string | undefined>(undefined);
export const FieldViewContext = createContext<FieldView | null>(null);

export interface RowContextValue {
  index: number;
  path: string;
  arrayPath: string;
}

export const RowContext = createContext<RowContextValue | null>(null);

export interface TreeEnv {
  root: string;
  childrenKey: string;
  rowKey: string;
}

export const TreeEnvContext = createContext<TreeEnv | null>(null);
export const TreeTemplateContext = createContext<ReactNode>(null);

export interface TreeNodeContextValue {
  path: string;
  index: number;
  arrayPath: string;
}

export const TreeNodeContext = createContext<TreeNodeContextValue | null>(null);

export function useFormContext<V = any>(): ShikiForm<V> {
  const form = useContext(FormContext);
  if (!form) throw new Error('ShikiForm hooks must be used inside <Form>');
  return form as ShikiForm<V>;
}
