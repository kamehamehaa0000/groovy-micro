/**
 * One vocabulary for the sort menus.
 *
 * Four directories sorted the same ideas under different words: "Recent",
 * "Newest" and "Recently added" all meant the same thing, and "A–Z",
 * "Name (A–Z)", "Alphabetical" and "Title" were four names for an
 * alphabetical sort. A user who learned one menu could not guess the words
 * in the next one.
 *
 * These are the labels. The keys are what each directory's API accepts; the
 * labels are what the user reads, and they are the same everywhere.
 */
export const SORT_TERMS = {
  /** When the item was added to the collection. */
  added: 'Recently added',
  /** When the item itself was published. */
  recent: 'Most recent',
  /** Alphabetical by title. */
  title: 'Title A–Z',
  /** Alphabetical by name. */
  name: 'Name A–Z',
  /** Alphabetical by creator. */
  creator: 'Creator A–Z',
  /** Alphabetical by artist. */
  artist: 'Artist A–Z',
  /** Most followers. */
  followers: 'Most followers',
  /** Most monthly listeners. */
  listeners: 'Most listeners',
  /** Most saves. */
  saved: 'Most saved',
  /** Most tracks in the item. */
  tracks: 'Most tracks',
  /** Most releases by the artist. */
  releases: 'Most releases',
  /** The release date of the item. */
  releaseDate: 'Release date',
} as const

export type SortTerm = keyof typeof SORT_TERMS
