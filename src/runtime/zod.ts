// Optional adapter mentioned in usage/11: `import { zodResolver } from 'shikiform/zod'`.
// Maps a Standard Schema-ish / Zod safeParse result into `{ [path]: message }`,
// the same shape as `useForm({ validate })`.

interface Issue {
  path: PropertyKey[];
  message: string;
}

interface Schema {
  safeParse: (values: unknown) => { success: true } | { success: false; error: { issues: Issue[] } };
}

export function zodResolver(schema: Schema) {
  return (values: unknown) => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.');
      if (path && !errors[path]) errors[path] = issue.message;
    }
    return errors;
  };
}
