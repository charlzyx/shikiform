/**
 * ShikiForm brand mark: a 3-tier geometric "S" / reactive form-flow monogram.
 * Drawn once and shared across Header / DocsLayout (Logo.astro) and OG social cards (src/pages/og/_card.ts).
 * Single-colour so each surface fills it with its own text colour in light & dark mode.
 */
export const logo = {
  /** Square 32×32 box; callers size by height and preserve 1:1 aspect ratio. */
  width: 32,
  height: 32,
  paths: [
    // Top-left reactive trigger node
    'M5 4a3 3 0 1 1 0 6a3 3 0 0 1 0-6Z',
    // Top-right field bar
    'M14 4h13a3 3 0 0 1 0 6H14a3 3 0 0 1 0-6Z',
    // Center reactive linkage spine
    'M9 13h14a3 3 0 0 1 0 6H9a3 3 0 0 1 0-6Z',
    // Bottom-left field bar
    'M5 22h13a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6Z',
    // Bottom-right derived output node
    'M27 22a3 3 0 1 1 0 6a3 3 0 0 1 0-6Z',
  ],
};
