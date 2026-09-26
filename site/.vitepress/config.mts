import { defineConfig } from 'vitepress'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = loadEnv(process.env.NODE_ENV || 'production', root, '')
const base = process.env.SITE_BASE || env.SITE_BASE || '/autobio-bae/'

export default defineConfig({
  lang: 'ko-KR',
  title: '배병희의 기록',
  titleTemplate: ':title · 가족의 서재',
  description: '밭과 바다에서 시작된 한 사람의 삶. 가족의 기억으로 함께 이어 쓰는 이야기입니다.',
  base,
  lastUpdated: false,
  cleanUrls: false,
  appearance: false,
  head: [
    ['meta', { name: 'theme-color', content: '#f7f5ef' }],
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
