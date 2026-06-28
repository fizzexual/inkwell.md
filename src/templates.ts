export interface Template {
  id: string;
  name: string;
  icon: string;
  folder: string;
  title: (d: Date) => string;
  body: (d: Date) => string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date) => d.toTimeString().slice(0, 5);

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank note",
    icon: "📄",
    folder: "",
    title: () => "Untitled Note",
    body: () => `# Untitled Note\n\n`,
  },
  {
    id: "meeting",
    name: "Meeting note",
    icon: "🗓️",
    folder: "Meetings",
    title: (d) => `Meeting — ${iso(d)}`,
    body: (d) =>
      `# Meeting — ${iso(d)}\n\n` +
      `**Date:** ${iso(d)} ${hm(d)}\n**Attendees:** \n\n` +
      `## Agenda\n- \n\n## Notes\n\n## Action items\n- [ ] \n`,
  },
  {
    id: "literature",
    name: "Literature note",
    icon: "📚",
    folder: "Sources",
    title: () => "New Source",
    body: () =>
      `---\ntype: source\nauthors: \nyear: \ncitekey: \n---\n\n` +
      `# New Source\n\n> [!quote]\n> Key quote…\n\n## Summary\n\n## Why it matters\n\n## Links\n- \n`,
  },
  {
    id: "project",
    name: "Project",
    icon: "🚀",
    folder: "Projects",
    title: () => "New Project",
    body: () =>
      `---\ntype: note\nstatus: active\n---\n\n` +
      `# New Project\n\n## Goal\n\n## Milestones\n- [ ] \n\n## Notes\n\n## Resources\n- \n`,
  },
  {
    id: "cornell",
    name: "Cornell note",
    icon: "🧠",
    folder: "",
    title: (d) => `Cornell — ${iso(d)}`,
    body: (d) =>
      `# Cornell — ${iso(d)}\n\n` +
      `## Cues\n- \n\n## Notes\n\n## Summary\n> [!note]\n> One-paragraph takeaway.\n`,
  },
  {
    id: "daily",
    name: "Daily note",
    icon: "📅",
    folder: "Daily",
    title: (d) => iso(d),
    body: (d) =>
      `# ${iso(d)}\n\n## Plan\n- [ ] \n\n## Log\n\n## Notes\n`,
  },
];
