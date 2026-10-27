import type { Rule, ValidateCtx } from './types';
import { isPromise } from './path';

export interface RuleEval {
  message: string | null;
  async?: Promise<string | null>;
}

function empty(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function evalRule(rule: Rule, value: unknown, ctx: ValidateCtx): RuleEval {
  const fail = (fallback: string) => rule.message ?? fallback;
  if (rule.required && empty(value)) return { message: fail('必填') };
  if (!empty(value)) {
    if (typeof rule.min === 'number' && Number(value) < rule.min) return { message: fail(`不能小于 ${rule.min}`) };
    if (typeof rule.max === 'number' && Number(value) > rule.max) return { message: fail(`不能大于 ${rule.max}`) };
    const length = Array.isArray(value) ? value.length : String(value).length;
    if (typeof rule.minLength === 'number' && length < rule.minLength) return { message: fail(`长度不能小于 ${rule.minLength}`) };
    if (typeof rule.maxLength === 'number' && length > rule.maxLength) return { message: fail(`长度不能大于 ${rule.maxLength}`) };
    if (rule.pattern && !rule.pattern.test(String(value))) return { message: fail('格式不正确') };
    if (rule.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) return { message: fail('邮箱格式不对') };
    if (rule.format === 'url' && !/^https?:\/\/\S+$/.test(String(value))) return { message: fail('链接格式不对') };
    if (rule.isTrue && value !== true) return { message: fail('必须勾选') };
  }
  if (rule.validator) {
    const ret = rule.validator(value, ctx);
    if (isPromise(ret)) {
      return {
        message: null,
        async: ret.then((msg) => (msg == null || msg === '' ? null : String(msg))),
      };
    }
    return { message: ret == null || ret === '' ? null : String(ret) };
  }
  return { message: null };
}

export function rulesShapeEqual(a: Rule[], b: Rule[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((rule, i) => {
    const left = { ...rule, validator: undefined, pattern: rule.pattern?.source };
    const rightRule = b[i];
    const right = { ...rightRule, validator: undefined, pattern: rightRule.pattern?.source };
    return JSON.stringify(left) === JSON.stringify(right);
  });
}
