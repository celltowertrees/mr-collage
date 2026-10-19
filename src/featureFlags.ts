// Toolbar tools that are switched off for now. A disabled tool only hides the
// way in: objects it already made (e.g. a saved or imported 3D object) still
// load, render, and keep their own controls.
//
// Flip a default to true to bring a tool back for everyone, or append
// ?enable=<name>[,<name>] to the URL to try it out (the e2e tests do this).
const DEFAULTS = {
  model3d: false,
  backgroundGeneration: false,
};

export type FeatureFlag = keyof typeof DEFAULTS;

function readEnabledFromURL(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const param = new URLSearchParams(window.location.search).get('enable');
  return new Set(param ? param.split(',').map((s) => s.trim()) : []);
}

const enabledFromURL = readEnabledFromURL();

export const features: Record<FeatureFlag, boolean> = Object.fromEntries(
  (Object.keys(DEFAULTS) as FeatureFlag[]).map((flag) => [
    flag,
    DEFAULTS[flag] || enabledFromURL.has(flag),
  ])
) as Record<FeatureFlag, boolean>;
