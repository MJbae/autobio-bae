import { defineConfig } from 'vitepress'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = loadEnv(process.env.NODE_ENV || 'production', root, '')
const base = process.env.SITE_BASE || env.SITE_BASE || '/autobio-bae/'

export default defineConfig({
  lang: 'ko-KR',
  title: '아버지의 이야기',
  titleTemplate: ':title · 아버지의 이야기',
  description: '아버지께서 걸어오신 길을 함께 읽습니다.',
  base,
  lastUpdated: false,
  cleanUrls: false,
  appearance: false,
  head: [
    ['meta', { name: 'theme-color', content: '#ffffff' }],
    ['meta', { name: 'color-scheme', content: 'light' }],
    [
      'meta',
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    ],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'ko_KR' }],
  ],
  markdown: {
    headers: { level: [2, 3] },
    // 원고의 일반 Markdown과 사진을 지원하며 임의 HTML 실행은 허용하지 않습니다.
    config(md) {
      md.set({ html: false })
    },
  },
  vite: {
    envDir: root,
    server: { fs: { allow: [root] } },
    build: { chunkSizeWarningLimit: 650 },
  },
  transformPageData(pageData) {
    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(['meta', { property: 'og:title', content: pageData.title }])
  },
})
