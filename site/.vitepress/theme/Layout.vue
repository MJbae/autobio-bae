<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { Content, useData, useRoute, withBase } from 'vitepress'
import Icon from './components/Icon.vue'
import rawCatalog from '../generated/catalog.json'

type Reading = { id: string; title: string; description: string; url: string; minutes: number }
type Chapter = Reading & { subtitle: string; decade: string }
type Document = Reading & { category: string; date?: string }
const catalog = rawCatalog as {
  title: string
  introduction: string
  chapters: Chapter[]
  documents: Document[]
  fullStory: { id: string; title: string; url: string; minutes: number }
}

const CommentsSection = defineAsyncComponent(() => import('./components/CommentsSection.vue'))
const { frontmatter, page } = useData()
const route = useRoute()
const isHome = computed(() => frontmatter.value.layout === 'home')
const isMissing = computed(() => page.value.isNotFound)
const title = computed(() => String(frontmatter.value.title || page.value.title || '이야기'))
const displayTitle = computed(() => title.value.replace(/^\d{4}년대\s*[—–-]\s*/, ''))
const pageId = computed(() => String(frontmatter.value.commentId || ''))
const fontSize = ref(1)
const progress = ref(0)
const query = ref('')
const filter = ref('all')
const mobileMenu = ref<HTMLDialogElement>()
const story = ref<HTMLElement>()
const search = ref<HTMLInputElement>()
const toc = ref<{ id: string; text: string; level: number }[]>([])
const activeHeading = ref('')
const lastRead = ref<{
  id: string
  title: string
  url: string
  progress: number
  scroll: number
} | null>(null)
const savedThisPage = ref(false)
const commentsReady = ref(false)
const commentsSentinel = ref<HTMLElement>()
let observer: IntersectionObserver | undefined
let commentsObserver: IntersectionObserver | undefined
let scrollFrame = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined

const chapters = computed(() =>
  catalog.chapters.filter((item) => match(item.title, item.description, item.decade))
)
const documents = computed(() =>
  catalog.documents.filter((item) => match(item.title, item.description, item.category))
)
const hasResults = computed(
  () =>
    (filter.value !== 'documents' && chapters.value.length > 0) ||
    (filter.value !== 'chapters' && documents.value.length > 0)
)
const storageKey = 'family-library:reading'
const articleLabel = computed(() =>
  frontmatter.value.kind === 'full' ? '전체 이야기' : frontmatter.value.decade || '가족의 자료'
)
const homeHref = computed(() => withBase('/'))

function match(...parts: string[]) {
  return parts.join(' ').toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())
}
function readStorage(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 사생활 보호 모드에서도 읽기는 계속됩니다. */
  }
}
function openMenu() {
  mobileMenu.value?.showModal()
}
function closeMenu() {
  mobileMenu.value?.close()
}
function jumpHeading(id: string) {
  closeMenu()
  const heading = document.getElementById(id)
  heading?.focus({ preventScroll: true })
  heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `${location.pathname}#${encodeURIComponent(id)}`)
}
async function jumpComments() {
  closeMenu()
  commentsReady.value = true
  await nextTick()
  commentsSentinel.value?.focus({ preventScroll: true })
  commentsSentinel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function goCollection(event: MouseEvent, id: string) {
  if (!isHome.value) return
  event.preventDefault()
  filter.value = 'all'
  query.value = ''
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `${homeHref.value}#${id}`)
}
function changeFont() {
  fontSize.value = (fontSize.value + 1) % 3
  writeStorage('family-library:font', String(fontSize.value))
}
function onScroll() {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    if (!story.value || isHome.value) return
    const top = story.value.getBoundingClientRect().top + window.scrollY
    const span = Math.max(1, story.value.offsetHeight - window.innerHeight + 180)
    progress.value = Math.max(
      0,
      Math.min(100, Math.round(((window.scrollY - top + 130) / span) * 100))
    )
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveReading, 300)
  })
}
function saveReading() {
  if (!pageId.value || isHome.value || isMissing.value) return
  const value = {
    id: pageId.value,
    title: displayTitle.value,
    url: route.path,
    progress: progress.value,
    scroll: Math.max(0, window.scrollY),
  }
  writeStorage(storageKey, JSON.stringify(value))
  lastRead.value = value
  savedThisPage.value = true
}
async function resumeReading() {
  const value = lastRead.value
  if (!value) return
  writeStorage('family-library:resume', JSON.stringify(value))
}
async function setupPage() {
  observer?.disconnect()
  commentsObserver?.disconnect()
  clearTimeout(saveTimer)
  progress.value = 0
  savedThisPage.value = false
  commentsReady.value = false
  toc.value = []
  activeHeading.value = ''
  await nextTick()
  if (story.value) {
    const headings = Array.from(story.value.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]'))
    toc.value = headings.map((h) => ({
      id: h.id,
      text: (h.textContent || '').replace(/\u200b|#$/g, '').trim(),
      level: Number(h.tagName.slice(1)),
    }))
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) activeHeading.value = entry.target.id
      },
      { rootMargin: '-100px 0px -65% 0px' }
    )
    headings.forEach((h) => observer?.observe(h))
    if (location.hash === '#comments') commentsReady.value = true
    if (commentsSentinel.value) {
      commentsObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            commentsReady.value = true
            commentsObserver?.disconnect()
          }
        },
        { rootMargin: '450px' }
      )
      commentsObserver.observe(commentsSentinel.value)
    }
    const resume = readStorage('family-library:resume')
    if (resume) {
      try {
        const value = JSON.parse(resume)
        if (value.id === pageId.value && typeof value.scroll === 'number') {
          requestAnimationFrame(() => window.scrollTo({ top: value.scroll, behavior: 'instant' }))
          try {
            localStorage.removeItem('family-library:resume')
          } catch {
            /* optional */
          }
        }
      } catch {
        /* Ignore malformed local preferences. */
      }
    }
  }
}

onMounted(() => {
  const preferred = Number(readStorage('family-library:font') ?? 1)
  if ([0, 1, 2].includes(preferred)) fontSize.value = preferred
  try {
    const saved = JSON.parse(readStorage(storageKey) || 'null')
    if (
      saved &&
      typeof saved.title === 'string' &&
      typeof saved.url === 'string' &&
      saved.url.startsWith(homeHref.value) &&
      !saved.url.startsWith('//')
    )
      lastRead.value = saved
  } catch {
    /* optional */
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('pagehide', saveReading)
  setupPage()
})
watch(
  () => route.path,
  () => {
    closeMenu()
    filter.value = 'all'
    query.value = ''
    setupPage()
  }
)
onBeforeUnmount(() => {
  observer?.disconnect()
  commentsObserver?.disconnect()
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('pagehide', saveReading)
  cancelAnimationFrame(scrollFrame)
  clearTimeout(saveTimer)
})
</script>

<template>
  <div class="library" :class="`font-${fontSize}`">
    <a class="skip-link" href="#main">본문으로 건너뛰기</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" :href="homeHref" aria-label="배병희의 기록, 서재 홈">
          <span class="brand-mark"><Icon name="book" :size="22" /></span>
          <span>배병희의 기록<span class="brand-subtitle">우리 가족의 서재</span></span>
        </a>
        <nav class="desktop-nav" aria-label="주 메뉴">
          <a :href="`${homeHref}#chronology`" @click="goCollection($event, 'chronology')"
            >연대별 이야기</a
          >
          <a :href="`${homeHref}#documents`" @click="goCollection($event, 'documents')"
            >모아둔 자료</a
          >
          <a class="nav-full" :href="withBase(catalog.fullStory.url)"
            >처음부터 끝까지 <Icon name="arrow" :size="16"
          /></a>
        </nav>
        <button class="icon-button mobile-menu-trigger" @click="openMenu" aria-label="목차 열기">
          <Icon name="menu" :size="23" />
        </button>
      </div>
      <div
        v-if="!isHome && !isMissing"
        class="reading-progress"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="읽기 진행률"
      >
        <span :style="{ width: `${progress}%` }" />
      </div>
    </header>

    <main v-if="isHome" id="main" class="home-main">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow"><span class="small-line" /> 삶을 기록하고, 기억을 나누다</p>
          <h1 id="hero-title">한 사람의 삶,<br />우리의 <span>이야기.</span></h1>
          <p class="hero-description">
            안면도의 밭과 바다에서 시작된 이야기.<br class="desktop-break" />
            함께 읽고, 우리가 기억하는 순간을 보태 주세요.
          </p>
          <a class="primary-button" :href="withBase(catalog.chapters[0].url)"
            >첫 이야기 읽기 <Icon name="arrow" :size="18"
          /></a>
          <p class="hero-note">1930년대부터 2020년대까지 · 열 편의 이야기</p>
        </div>
        <div class="book-cover" aria-hidden="true">
          <div class="book-cover-inner">
            <span class="cover-edition">가족의 기록 · 첫 번째 책</span>
            <div class="cover-title">살아온 날들,<br />이어질 기억들.</div>
            <div class="cover-landscape">
              <span class="landscape-sun" /><span class="landscape-hill hill-one" /><span
                class="landscape-hill hill-two"
              /><span class="landscape-water" />
            </div>
            <div class="cover-bottom"><span>배병희의 이야기</span><span>1936 —</span></div>
          </div>
        </div>
      </section>

      <a v-if="lastRead" class="resume-card" :href="lastRead.url" @click="resumeReading">
        <span class="resume-icon"><Icon name="bookmark" /></span>
        <span class="resume-copy"
          ><small>읽던 이야기 이어서</small><strong>{{ lastRead.title }}</strong></span
        >
        <span class="resume-percent">{{ lastRead.progress }}%</span><Icon name="arrow" />
      </a>

      <section id="chronology" class="collection-section" aria-labelledby="chronology-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">시간을 따라 읽기</p>
            <h2 id="chronology-title">연대별 이야기<span class="count">10</span></h2>
          </div>
          <a class="text-link desktop-only" :href="withBase(catalog.fullStory.url)"
            >전체 글로 읽기 <Icon name="arrow" :size="17"
          /></a>
        </div>
        <div class="library-tools">
          <div class="filter-tabs" role="group" aria-label="자료 종류">
            <button
              :class="{ selected: filter === 'all' }"
              :aria-pressed="filter === 'all'"
              @click="filter = 'all'"
            >
              모두</button
            ><button
              :class="{ selected: filter === 'chapters' }"
              :aria-pressed="filter === 'chapters'"
              @click="filter = 'chapters'"
            >
              이야기</button
            ><button
              :class="{ selected: filter === 'documents' }"
              :aria-pressed="filter === 'documents'"
              @click="filter = 'documents'"
            >
              자료
            </button>
          </div>
          <div class="search-field">
            <Icon name="search" :size="18" /><input
              id="library-search"
              ref="search"
              v-model="query"
              type="search"
              aria-label="제목과 소개에서 찾기"
              placeholder="어떤 이야기를 찾으세요?"
              autocomplete="off"
            />
          </div>
        </div>
        <div v-if="filter !== 'documents'" class="chapter-grid">
          <a
            v-for="chapter in chapters"
            :key="chapter.id"
            class="chapter-card"
            :href="withBase(chapter.url)"
          >
            <div class="chapter-card-top">
              <span class="chapter-decade">{{ chapter.decade }}</span
              ><span class="chapter-number">{{
                String(catalog.chapters.findIndex((c) => c.id === chapter.id) + 1).padStart(2, '0')
              }}</span>
            </div>
            <h3>{{ chapter.subtitle }}</h3>
            <p>{{ chapter.description }}</p>
            <div class="chapter-card-bottom">
              <span><Icon name="clock" :size="14" /> 약 {{ chapter.minutes }}분</span
              ><span class="card-arrow"><Icon name="arrow" :size="19" /></span>
            </div>
          </a>
        </div>
        <p v-if="!hasResults" class="empty-search" role="status">
          찾는 이야기가 없어요. 다른 제목이나 연대로 찾아보세요.
        </p>
      </section>

      <section
        v-if="filter !== 'chapters'"
        id="documents"
        class="documents-section"
        aria-labelledby="documents-title"
      >
        <div class="section-heading">
          <div>
            <p class="eyebrow">이야기 곁에 두는 기록</p>
            <h2 id="documents-title">
              모아둔 자료<span class="count">{{ catalog.documents.length }}</span>
            </h2>
          </div>
          <Icon name="book" :size="25" />
        </div>
        <div v-if="documents.length" class="document-list">
          <a v-for="doc in documents" :key="doc.id" :href="withBase(doc.url)" class="document-card"
            ><span class="document-icon"><Icon name="book" :size="22" /></span
            ><span class="document-copy"
              ><small>{{ doc.category || '가족의 기록' }}</small
              ><strong>{{ doc.title }}</strong
              ><span>{{ doc.description }}</span></span
            ><Icon name="chevron" :size="18"
          /></a>
        </div>
        <p v-else-if="!query" class="quiet-note">
          함께 읽을 편지와 사진 속 이야기들을 이곳에 차곡차곡 모아둘게요.
        </p>
      </section>

      <aside class="memory-invitation">
        <Icon name="leaf" :size="28" />
        <div>
          <h2>당신의 기억도 한 페이지가 됩니다.</h2>
          <p>
            조금 다르게 기억하는 일, 미처 담지 못한 순간이 있나요?<br class="desktop-break" />
            각 이야기 아래에 편하게 남겨 주세요.
          </p>
        </div>
        <span class="invitation-note">이름과 이야기만으로 충분해요.</span>
      </aside>
    </main>

    <main v-else-if="isMissing" id="main" class="not-found">
      <p class="eyebrow">잠시 길을 벗어났네요</p>
      <h1>이야기를 찾지 못했어요.</h1>
      <p>주소가 바뀌었거나 아직 준비 중인 페이지예요.</p>
      <a class="primary-button" :href="homeHref">서재로 돌아가기 <Icon name="arrow" /></a>
    </main>

    <main v-else id="main" class="reader-main">
      <aside class="reader-sidebar" aria-label="연대별 이야기 목록">
        <a class="back-to-library" :href="homeHref"
          ><Icon name="back" :size="16" /> 서재로 돌아가기</a
        >
        <p class="eyebrow">연대별 이야기</p>
        <a
          v-for="chapter in catalog.chapters"
          :key="chapter.id"
          :href="withBase(chapter.url)"
          :class="['sidebar-chapter', { active: chapter.id === pageId }]"
          :aria-current="chapter.id === pageId ? 'page' : undefined"
          ><span>{{ chapter.decade }}</span
          ><small>{{ chapter.subtitle }}</small></a
        ><a class="sidebar-full" :href="withBase(catalog.fullStory.url)"
          ><Icon name="book" :size="16" /> 전체 글로 읽기</a
        >
      </aside>
      <div class="reader-column">
        <div class="reader-breadcrumb">
          <a :href="homeHref">서재</a><Icon name="chevron" :size="13" /><span>{{
            articleLabel
          }}</span>
        </div>
        <header class="article-header">
          <p class="eyebrow">{{ articleLabel }}</p>
          <h1>{{ displayTitle }}</h1>
          <div class="article-meta">
            <span><Icon name="clock" :size="15" /> 약 {{ frontmatter.minutes || 1 }}분 읽기</span
            ><span class="meta-dot">·</span><span>배병희의 기록</span
            ><button
              class="font-button"
              @click="changeFont"
              :aria-label="`글자 크기 ${['보통', '크게', '더 크게'][fontSize]}, 눌러서 변경`"
            >
              <span aria-hidden="true">가<span class="font-small">가</span></span>
              {{ ['보통', '크게', '더 크게'][fontSize] }}
            </button>
          </div>
        </header>
        <details v-if="toc.length" class="inline-toc">
          <summary>
            <Icon name="menu" :size="18" /> 이 이야기의 목차 <span>{{ toc.length }}</span>
          </summary>
          <ol>
            <li v-for="heading in toc" :key="heading.id">
              <button @click="jumpHeading(heading.id)">{{ heading.text }}</button>
            </li>
          </ol>
        </details>
        <article ref="story" class="story-content"><Content /></article>
        <div class="story-end"><span /><Icon name="leaf" :size="21" /><span /></div>
        <p class="reading-save-note">
          <Icon name="bookmark" :size="14" />
          {{
            savedThisPage
              ? '이 기기에 읽던 곳을 기억해 두었어요.'
              : '천천히, 편한 속도로 읽어 주세요.'
          }}
        </p>
        <nav
          v-if="frontmatter.prev || frontmatter.next"
          class="chapter-navigation"
          aria-label="앞뒤 이야기"
        >
          <a v-if="frontmatter.prev" :href="withBase(frontmatter.prev.url)"
            ><small><Icon name="back" :size="15" /> 이전 이야기</small
            ><strong>{{ frontmatter.prev.title }}</strong></a
          ><span v-else /><a
            v-if="frontmatter.next"
            class="next-chapter"
            :href="withBase(frontmatter.next.url)"
            ><small>다음 이야기 <Icon name="arrow" :size="15" /></small
            ><strong>{{ frontmatter.next.title }}</strong></a
          >
        </nav>
        <section
          v-if="pageId"
          id="comments"
          ref="commentsSentinel"
          class="comments-anchor"
          tabindex="-1"
          aria-label="가족의 기억과 댓글"
        >
          <ClientOnly
            ><CommentsSection
              v-if="commentsReady"
              :key="pageId"
              :page-id="pageId"
              :page-title="title" />
            <div v-else class="comments-preview">
              <Icon name="comment" :size="26" />
              <h2>함께 나누는 기억</h2>
              <button class="text-link" @click="jumpComments">
                댓글 보기 <Icon name="arrow" />
              </button></div
          ></ClientOnly>
        </section>
      </div>
      <aside class="reader-toc" v-if="toc.length" aria-label="현재 이야기 목차">
        <p class="eyebrow">이 이야기 속에서</p>
        <button
          v-for="heading in toc"
          :key="heading.id"
          :class="{ active: activeHeading === heading.id }"
          @click="jumpHeading(heading.id)"
        >
          {{ heading.text }}
        </button>
      </aside>
    </main>

    <footer class="site-footer">
      <a :href="homeHref"><Icon name="book" :size="17" /> 배병희의 기록</a>
      <p>함께 기억하고, 오래 간직하는 이야기.</p>
      <span>우리 가족의 서재</span>
    </footer>
    <nav v-if="!isHome && !isMissing" class="mobile-reader-bar" aria-label="읽기 도구">
      <a :href="homeHref"><Icon name="home" :size="20" /><span>서재</span></a
      ><button @click="openMenu"><Icon name="menu" :size="20" /><span>목차</span></button
      ><button @click="changeFont">
        <span class="font-bar-icon" aria-hidden="true">가</span><span>글자 크기</span></button
      ><button @click="jumpComments">
        <Icon name="comment" :size="20" /><span>댓글 남기기</span>
      </button>
    </nav>

    <dialog
      ref="mobileMenu"
      class="contents-dialog"
      aria-labelledby="contents-title"
      @click="
        (event) => {
          if (event.target === mobileMenu) closeMenu()
        }
      "
    >
      <div class="dialog-content">
        <header>
          <div>
            <p class="eyebrow">우리 가족의 서재</p>
            <h2 id="contents-title">{{ isHome ? '연대별 이야기' : '이야기 목차' }}</h2>
          </div>
          <button class="icon-button" @click="closeMenu" aria-label="목차 닫기">
            <Icon name="close" :size="23" />
          </button>
        </header>
        <template v-if="!isHome && toc.length"
          ><p class="dialog-current">{{ displayTitle }}</p>
          <button
            v-for="heading in toc"
            :key="heading.id"
            class="dialog-heading"
            @click="jumpHeading(heading.id)"
          >
            {{ heading.text }}<Icon name="chevron" :size="15" />
          </button>
          <div class="dialog-divider" /></template
        ><a
          v-for="chapter in catalog.chapters"
          :key="chapter.id"
          :href="withBase(chapter.url)"
          class="dialog-chapter"
          @click="closeMenu"
          ><span>{{ chapter.decade }}</span
          ><strong>{{ chapter.subtitle }}</strong
          ><Icon name="chevron" :size="16" /></a
        ><a class="dialog-all" :href="homeHref" @click="closeMenu"
          >서재 전체 보기 <Icon name="arrow" :size="17"
        /></a>
      </div>
    </dialog>
  </div>
</template>
