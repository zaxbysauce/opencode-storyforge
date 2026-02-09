function getSectionLines(content: string, heading: string): string[] {
  const lines = content.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (startIdx === -1) return [];

  const section: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    if (line.trim()) section.push(line.trim());
  }
  return section;
}

export function extractCurrentPhase(content: string): string | null {
  const section = getSectionLines(content, 'Workflow Status');
  for (const line of section) {
    if (line.startsWith('- [ ]')) {
      return line.replace('- [ ]', '').trim();
    }
  }
  return null;
}

export function extractIncompleteTasks(content: string): string | null {
  const section = getSectionLines(content, 'Workflow Status');
  const tasks = section.filter((line) => line.startsWith('- [ ]')).map((line) => line.replace('- [ ]', '').trim());
  return tasks.length ? tasks.join('\n') : null;
}

export function extractDecisions(content: string, limit = 500): string | null {
  const section = getSectionLines(content, 'Decisions');
  const result = section.join('\n');
  if (!result) return null;
  return result.length > limit ? result.slice(0, limit) : result;
}
