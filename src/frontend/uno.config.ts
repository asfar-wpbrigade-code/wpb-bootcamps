import { defineConfig, presetAttributify, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      collections: {
        'simple-icons': () => import('@iconify-json/simple-icons/icons.json').then(i => i.default),
        'heroicons': () => import('@iconify-json/heroicons/icons.json').then(i => i.default),
      },
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  // Nothing to safelist - see the note in nuxt.config.ts. These were the
  // upstream demo's sponsor logos and no component renders them.
  safelist: [],
  theme: {
    colors: {
      primary: '#3458eb',
      secondary: '#FFE5AE',
      background: {
        light: '#FFFFFF',
        pink: '#FFE5EC'
      },
      text: {
        primary: '#2D3436',
        secondary: '#495265'
      }
    },
    fontFamily: {
      sans: ['Inter', 'system-ui', 'sans-serif'],
      display: ['Inter', 'system-ui', 'sans-serif']
    }
  }
})
