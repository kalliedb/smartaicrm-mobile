/**
 * Visual tokens for SmartAI BMS Field.
 *
 * Light theme by default — better outdoor sun visibility (FRD §6.3).
 * Single accent colour is the brand teal, matching the desktop platform.
 * Dark theme can be added later by switching the `colors` object based
 * on the system Appearance API.
 */

export const colors = {
  // Brand
  primary:        '#0D9488',  // teal — matches web portal
  primaryDark:    '#0F766E',
  primaryLight:   '#5EEAD4',
  accent:         '#F59E0B',  // amber — for warnings / promos

  // Surface
  background:     '#FFFFFF',
  surface:        '#F8FAFC',
  surfaceMuted:   '#F1F5F9',
  border:         '#E2E8F0',
  borderStrong:   '#CBD5E1',

  // Text
  text:           '#0F172A',
  textMuted:      '#475569',
  textSubtle:     '#94A3B8',
  textInverse:    '#FFFFFF',

  // Semantic
  success:        '#16A34A',
  warning:        '#F59E0B',
  danger:         '#DC2626',
  info:           '#2563EB',
} as const

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
} as const

export const radii = {
  sm: 6, md: 10, lg: 14, xl: 20, pill: 999,
} as const

export const typography = {
  // Font families filled in by react-native default (San Francisco / Roboto).
  // Heading sizes track the desktop web app's font-heading scale.
  h1:    { fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  h2:    { fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  h3:    { fontSize: 20, fontWeight: '600' as const, lineHeight: 26 },
  body:  { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  bodyB: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  small: { fontSize: 14, fontWeight: '400' as const, lineHeight: 18 },
  micro: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
} as const

// Minimum tap target (FRD §6.3) — iOS HIG = 44pt, Android Material = 48dp.
// Use the larger value to stay safe on both.
export const HIT_SLOP_MIN = 48
