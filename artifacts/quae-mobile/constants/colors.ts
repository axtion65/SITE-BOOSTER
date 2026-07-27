/**
 * Quae.ai brand tokens — synced from artifacts/quae/src/index.css
 * Both light and dark are set to the same dark-mode values since Quae
 * is a dark-first product.
 */

const palette = {
  background: '#0a0a0f',      // hsl(240 20% 5%)
  foreground: '#fafafa',      // hsl(0 0% 98%)
  card: '#0e0e15',            // hsl(240 20% 7%)
  cardForeground: '#fafafa',
  cardBorder: '#1f1f2e',      // hsl(240 20% 15%)
  primary: '#7c3bed',         // hsl(262 83% 58%)
  primaryForeground: '#ffffff',
  secondary: '#181825',       // hsl(240 20% 12%)
  secondaryForeground: '#fafafa',
  muted: '#181825',
  mutedForeground: '#a1a1aa', // hsl(240 5% 65%)
  accent: '#7c3bed',
  accentForeground: '#fafafa',
  destructive: '#ef4343',     // hsl(0 84% 60%)
  destructiveForeground: '#fafafa',
  border: '#1f1f2e',
  input: '#1f1f2e',
  // legacy aliases
  text: '#fafafa',
  tint: '#7c3bed',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 12,
};

export default colors;
