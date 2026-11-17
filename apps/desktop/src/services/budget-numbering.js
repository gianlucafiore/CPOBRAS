/** Presentation numbers follow the visible tree; persistent identities stay unchanged. */
export function budgetNumbering(sections = [], lines = [], assignments = {}) {
  const assigned =
    assignments instanceof Map
      ? assignments
      : new Map(
          Array.isArray(assignments)
            ? assignments
            : Object.entries(assignments),
        );
  const ids = new Set(sections.map((s) => s.id)),
    sectionNumbers = new Map(),
    lineNumbers = new Map(),
    visited = new Set();
  const children = (parent) =>
    sections
      .filter((s) => (ids.has(s.parent_id) ? s.parent_id : null) === parent)
      .sort((a, b) => a.position - b.position);
  const walk = (section, number) => {
    if (visited.has(section.id))
      throw new Error("Jerarquía de rubros inválida");
    visited.add(section.id);
    sectionNumbers.set(section.id, number);
    const own = lines.filter((l) => assigned.get(l.id) === section.id);
    own.forEach((l, i) => lineNumbers.set(l.id, `${number}.${i + 1}`));
    children(section.id).forEach((s, i) =>
      walk(s, `${number}.${own.length + i + 1}`),
    );
  };
  const roots = children(null);
  roots.forEach((s, i) => walk(s, String(i + 1)));
  if (visited.size !== sections.length)
    throw new Error("Jerarquía de rubros inválida");
  lines
    .filter((l) => !ids.has(assigned.get(l.id)))
    .forEach((l, i) => lineNumbers.set(l.id, String(roots.length + i + 1)));
  return { sections: sectionNumbers, lines: lineNumbers };
}
