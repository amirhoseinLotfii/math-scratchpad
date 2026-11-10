/** Canonical viewport thresholds shared by CSS tokens and browser behavior. */
export const BREAKPOINTS = {
  tinyPhone: 360,
  phone: 480,
  compact: 600,
  tablet: 768,
  workspace: 900,
  desktopInput: 1024,
  split: 1100,
  wide: 1600,
} as const;

const minWidth = (width: number) => `(min-width: ${width}px)`;
const belowWidth = (width: number) => `(max-width: ${width - 1}px)`;

export const BREAKPOINT_MEDIA = {
  compact: belowWidth(BREAKPOINTS.compact),
  workspace: minWidth(BREAKPOINTS.workspace),
  split: minWidth(BREAKPOINTS.split),
  wide: minWidth(BREAKPOINTS.wide),
  desktopKeyboard: `(pointer: fine) and ${minWidth(BREAKPOINTS.desktopInput)}`,
} as const;
