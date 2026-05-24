// Replace this list when the admin route is wired up.
export const NAMES: string[] = [
  "Joshua Zobule",
  "Mary Tovua",
  "Peter Kenilorea",
  "Grace Maelasi",
  "Daniel Sogavare",
  "Lily Tanggaru",
  "Samuel Houenipwela",
  "Hannah Wale",
  "Jonathan Manele",
  "Esther Lilo",
  "Michael Riumana",
  "Sarah Manetoali",
  "David Bartlett",
  "Ruth Oti",
  "Andrew Ramo",
  "Naomi Sade",
  "Joseph Vasethe",
  "Rebecca Filua",
  "Thomas Suri",
  "Eunice Maezama",
];

export function pickRandomName(exclude?: string): string {
  const pool = exclude && NAMES.length > 1 ? NAMES.filter((n) => n !== exclude) : NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
