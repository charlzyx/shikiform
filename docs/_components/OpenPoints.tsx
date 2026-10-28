export function OpenPoints({ code }: { code: string }) {
  const lines = code.split('\n');
  const clean = (value: string) => value.replace(/\*\/\}?\s*$/, '').replace(/^\/\/\s*/, '').trim();
  const points: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const at = line.indexOf('❓');
    if (at < 0) continue;
    const parts = [clean(line.slice(at + 1))];
    let inBlock = line.includes('/*') && !line.includes('*/');
    for (let j = i + 1; j < lines.length; j++) {
      const text = lines[j].trim();
      if (text.includes('❓')) break;
      if (inBlock) {
        parts.push(clean(text));
        if (text.includes('*/')) break;
        continue;
      }
      if (/^\/\/\s{2,}\S/.test(text)) {
        parts.push(clean(text));
        continue;
      }
      break;
    }
    points.push({ line: i + 1, text: parts.filter(Boolean).join(' ') });
  }
  if (points.length === 0) return <p>本用例没有标记 ❓。</p>;
  return (
    <ul>
      {points.map((point) => (
        <li key={point.line}>
          <code>L{point.line}</code> {point.text}
        </li>
      ))}
    </ul>
  );
}
