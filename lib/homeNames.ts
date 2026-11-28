// A plan file names the home its plan showed (never an address or a token); on import that name is matched against the homes this Doshy has. Pure.

/** The id of the home called `name` (ignoring case and surrounding spaces), or null: a file from another Doshy points at no home here unless one has the same name. */
export function homeIdForName(homes: readonly { id: string; name: string }[], name: string | undefined): string | null {
  const wanted = name?.trim().toLowerCase();
  return wanted ? (homes.find((h) => h.name.trim().toLowerCase() === wanted)?.id ?? null) : null;
}
