import { CollageText } from '../types';

// The style fields a preset controls. Applying one sets every field here —
// those it doesn't use are cleared — so presets replace each other instead
// of piling up (an arch from one preset doesn't survive picking a flat one).
export type WordArtPresetStyle = Pick<CollageText, 'color' | 'gradient' | 'outline' | 'extrusion' | 'warp'> &
  Partial<Pick<CollageText, 'bold' | 'italic' | 'fontFamily'>>;

export interface WordArtPreset {
  id: string;
  name: string;
  style: WordArtPresetStyle;
}

const preset = (
  id: string,
  name: string,
  style: Partial<WordArtPresetStyle> & Pick<WordArtPresetStyle, 'color'>
): WordArtPreset => ({
  id,
  name,
  style: {
    gradient: undefined,
    outline: undefined,
    extrusion: undefined,
    warp: undefined,
    ...style,
  },
});

export const WORDART_PRESETS: WordArtPreset[] = [
  preset('plain', 'Plain', { color: '#111111' }),
  preset('outlined', 'Outlined', { color: '#ffffff', outline: { color: '#111111', width: 3 }, bold: true }),
  preset('sunset-arch', 'Sunset Arch', {
    color: '#ff512f',
    gradient: { to: '#f9d423', angle: 90 },
    outline: { color: '#7a1f00', width: 2 },
    warp: { shape: 'arch-up', amount: 50 },
    bold: true,
  }),
  preset('ocean-wave', 'Ocean Wave', {
    color: '#00c6ff',
    gradient: { to: '#0050c8', angle: 90 },
    outline: { color: '#002b55', width: 2 },
    warp: { shape: 'wave', amount: 55 },
    bold: true,
  }),
  preset('retro-block', 'Retro Block', {
    color: '#ffcc00',
    outline: { color: '#1a1a1a', width: 2 },
    extrusion: { color: '#c0392b', depth: 10, angle: 45 },
    fontFamily: 'Bebas Neue',
  }),
  preset('chrome', 'Chrome', {
    color: '#fafafa',
    gradient: { to: '#6e6e6e', angle: 90 },
    outline: { color: '#2b2b2b', width: 1.5 },
    extrusion: { color: '#555555', depth: 6, angle: 90 },
    bold: true,
  }),
  preset('neon', 'Neon', {
    color: '#39ff14',
    outline: { color: '#0b3d02', width: 3 },
    fontFamily: 'Pacifico',
  }),
  preset('candy-bulge', 'Candy Bulge', {
    color: '#ff0080',
    gradient: { to: '#7928ca', angle: 0 },
    outline: { color: '#3a0050', width: 2 },
    warp: { shape: 'bulge', amount: 60 },
    bold: true,
  }),
  preset('circle-badge', 'Circle Badge', {
    color: '#1a237e',
    warp: { shape: 'circle', amount: 25 },
    bold: true,
    fontFamily: 'Oswald',
  }),
  preset('bubblegum-pinch', 'Bubblegum Pinch', {
    color: '#ff9a9e',
    gradient: { to: '#fad0c4', angle: 90 },
    outline: { color: '#c2185b', width: 2 },
    warp: { shape: 'pinch', amount: 55 },
    bold: true,
  }),
  preset('speed-slant', 'Speed Slant', {
    color: '#e53935',
    extrusion: { color: '#4a0000', depth: 8, angle: 160 },
    warp: { shape: 'slant-up', amount: 45 },
    bold: true,
    italic: true,
  }),
  preset('golden-smile', 'Golden Smile', {
    color: '#f7e199',
    gradient: { to: '#b8860b', angle: 90 },
    outline: { color: '#5c4400', width: 2 },
    warp: { shape: 'arch-down', amount: 45 },
    fontFamily: 'Playfair Display',
    bold: true,
  }),
  preset('comic-pop', 'Comic Pop', {
    color: '#ffeb3b',
    outline: { color: '#000000', width: 4 },
    extrusion: { color: '#222222', depth: 7, angle: 45 },
    fontFamily: 'Lobster',
  }),
];

// The changes that put a preset on a text object. Text, size, position and
// every non-style field are left alone.
export function applyWordArtPreset(p: WordArtPreset): Partial<CollageText> {
  return { ...p.style };
}
