<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  fetchComments,
  isCommentsConfigured,
  postComment,
  type FamilyComment,
} from '../lib/comments'

const props = defineProps<{ pageId: string; pageTitle: string }>()
type ReplyContext = Pick<FamilyComment, 'id' | 'author' | 'body'>
type Draft = { body: string; replyTo: ReplyContext | null }

const NAME_KEY = 'family-library:comment-name'
const draftKey = (pageId: string) => `family-library:comment-draft:${pageId}`
const author = ref('')
const body = ref('')
const replyTo = ref<ReplyContext | null>(null)
const comments = ref<FamilyComment[]>([])
const cursor = shallowRef<Parameters<typeof fetchComments>[1]>()
const hasMore = ref(false)
const configured = ref(false)
const ready = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const submitting = ref(false)
const loadError = ref('')
const submitError = ref('')
const authorError = ref('')
const bodyError = ref('')
const announcement = ref('')
const authorInput = ref<HTMLInputElement | null>(null)
const bodyInput = ref<HTMLTextAreaElement | null>(null)
const composer = ref<HTMLFormElement | null>(null)
const now = ref(0)
const cooldownUntil = ref(0)
const cooldownSeconds = computed(() =>
  Math.max(0, Math.ceil((cooldownUntil.value - now.value) / 1000))
)
const commentById = computed(() => new Map(comments.value.map((comment) => [comment.id, comment])))
let mounted = false
let restoringDraft = false
let activePageId = ''
let requestVersion = 0
let cooldownTimer: ReturnType<typeof setInterval> | undefined
const locallyPostedIds = new Set<string>()

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Reading and commenting still work when a browser disables local storage.
  }
}

function readDraft(pageId: string): Draft | null {
  try {
    const draft = JSON.parse(readLocal(draftKey(pageId)) || 'null')
    if (!draft || typeof draft.body !== 'string') return null
    const reply = draft.replyTo
    return {
      body: draft.body.slice(0, 2000),
      replyTo:
        reply &&
        typeof reply.id === 'string' &&
        typeof reply.author === 'string' &&
        typeof reply.body === 'string'
          ? { id: reply.id, author: reply.author.slice(0, 24), body: reply.body.slice(0, 2000) }
          : null,
    }
  } catch {
    return null
  }
}

function saveDraft() {
  if (!mounted || restoringDraft || !activePageId) return
  writeLocal(
    draftKey(activePageId),
    body.value || replyTo.value
      ? JSON.stringify({ body: body.value, replyTo: replyTo.value })
      : null
  )
}

watch([body, replyTo], saveDraft, { flush: 'sync' })
watch(author, (value) => {
  if (mounted) writeLocal(NAME_KEY, value.slice(0, 24))
  if (value.trim()) authorError.value = ''
})
watch(body, (value) => {
  if (value.trim()) bodyError.value = ''
})

function friendlyError(error: unknown, fallback: string) {
  // The data layer supplies messages intended for readers; do not expose SDK errors.
  const message = error instanceof Error ? error.message : ''
  return /^[가-힣0-9]/.test(message) && /[가-힣]/.test(message) && message.length <= 200
    ? message
    : fallback
}

async function loadComments(more = false) {
  if (!configured.value || loading.value || loadingMore.value) return
  const version = requestVersion
  const pageId = props.pageId
  loadError.value = ''
  if (more) loadingMore.value = true
  else loading.value = true
  try {
    const result = await fetchComments(pageId, more ? cursor.value : undefined)
    if (version !== requestVersion || pageId !== props.pageId) return
    // A reader may post while the initial request is still in flight.
    const existing = more
      ? comments.value
      : comments.value.filter((comment) => locallyPostedIds.has(comment.id))
    const seen = new Set(existing.map((comment) => comment.id))
    comments.value = [...existing, ...result.comments.filter((comment) => !seen.has(comment.id))]
    cursor.value = result.cursor
    hasMore.value = result.hasMore
  } catch (error) {
    if (version !== requestVersion || pageId !== props.pageId) return
    loadError.value = friendlyError(
      error,
      '댓글을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
    )
  } finally {
    if (version === requestVersion && pageId === props.pageId) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function openPage() {
  requestVersion += 1
  activePageId = props.pageId
  restoringDraft = true
  const draft = readDraft(activePageId)
  body.value = draft?.body ?? ''
  replyTo.value = draft?.replyTo ?? null
  restoringDraft = false
  comments.value = []
  locallyPostedIds.clear()
  cursor.value = undefined
  hasMore.value = false
  loading.value = false
  loadingMore.value = false
  submitting.value = false
  loadError.value = ''
  submitError.value = ''
  authorError.value = ''
  bodyError.value = ''
  announcement.value = ''
  configured.value = isCommentsConfigured()
  ready.value = true
  void loadComments()
}

watch(
  () => props.pageId,
  () => {
    if (mounted) openPage()
  }
)

onMounted(() => {
  mounted = true
  author.value = (readLocal(NAME_KEY) || '').slice(0, 24)
  openPage()
})

onBeforeUnmount(() => {
  saveDraft()
  mounted = false
  requestVersion += 1
  if (cooldownTimer) clearInterval(cooldownTimer)
})

function excerpt(text: string) {
  const value = text.replace(/\s+/g, ' ').trim()
  return value.length > 72 ? `${value.slice(0, 72)}…` : value
}

function dateLabel(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '방금'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(timestamp))
}

function dateTime(timestamp: number) {
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : undefined
}

async function focusComposer() {
  await nextTick()
  composer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (author.value.trim()) bodyInput.value?.focus({ preventScroll: true })
  else authorInput.value?.focus({ preventScroll: true })
}

async function startReply(comment: FamilyComment) {
  replyTo.value = { id: comment.id, author: comment.author, body: comment.body }
  submitError.value = ''
  announcement.value = `${comment.author} 님의 댓글에 답글을 쓰고 있어요.`
  await nextTick()
  bodyInput.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  bodyInput.value?.focus({ preventScroll: true })
}

async function cancelReply() {
  replyTo.value = null
  announcement.value = '답글을 취소했어요. 작성 중인 내용은 그대로 있어요.'
  await nextTick()
  bodyInput.value?.focus()
}

function startCooldown() {
  now.value = Date.now()
  cooldownUntil.value = now.value + 15_000
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    now.value = Date.now()
    if (cooldownSeconds.value === 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = undefined
    }
  }, 1000)
}

async function submit() {
  if (submitting.value || cooldownSeconds.value || !configured.value) return
  const cleanAuthor = author.value.trim()
  const cleanBody = body.value.trim()
  authorError.value = !cleanAuthor
    ? '이름을 적어 주세요.'
    : cleanAuthor.length > 24
      ? '이름은 24자까지 적을 수 있어요.'
      : ''
  bodyError.value = !cleanBody
    ? '남기고 싶은 이야기를 적어 주세요.'
    : cleanBody.length > 2000
      ? '댓글은 2,000자까지 적을 수 있어요.'
      : ''
  if (authorError.value || bodyError.value) {
    await nextTick()
    if (authorError.value) authorInput.value?.focus()
    else bodyInput.value?.focus()
    return
  }
  const pageId = props.pageId
  const version = requestVersion
  const draftBody = body.value
  const parentId = replyTo.value?.id ?? null
  submitting.value = true
  submitError.value = ''
  announcement.value = ''
  try {
    const comment = await postComment(pageId, { author: cleanAuthor, body: cleanBody, parentId })
    if (mounted) startCooldown()
    if (!mounted || version !== requestVersion || pageId !== props.pageId) {
      const saved = readDraft(pageId)
      if (saved?.body === draftBody && (saved.replyTo?.id ?? null) === parentId)
        writeLocal(draftKey(pageId), null)
      return
    }
    locallyPostedIds.add(comment.id)
    comments.value = [comment, ...comments.value.filter((item) => item.id !== comment.id)]
    body.value = ''
    replyTo.value = null
    announcement.value = '댓글을 남겼어요. 기억을 보태 주셔서 고맙습니다.'
  } catch (error) {
    if (!mounted || version !== requestVersion || pageId !== props.pageId) return
    submitError.value = friendlyError(
      error,
      '댓글을 남기지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.'
    )
  } finally {
    if (mounted && version === requestVersion && pageId === props.pageId) submitting.value = false
  }
}

defineExpose({ focusComposer })
</script>

<template>
  <section class="family-comments" aria-labelledby="comments-heading" tabindex="-1">
    <header class="comments-heading">
      <span class="eyebrow">함께 쓰는 이야기</span>
      <h2 id="comments-heading">기억을 보태 주세요</h2>
      <p>
        다르게 기억하는 일, 함께 떠오른 이야기를 들려주세요.<br class="desktop-break" />
        짧은 안부도 좋아요.
      </p>
    </header>

    <div v-if="!ready" class="state-card" role="status">댓글을 준비하고 있어요.</div>
    <div v-else-if="!configured" class="state-card" role="status">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z" />
        <path d="M7 11h10M7 15h6" />
      </svg>
      <p>댓글을 준비하고 있어요.<br />조금 뒤에 다시 찾아주세요.</p>
    </div>

    <template v-else>
      <form
        ref="composer"
        class="comment-composer"
        novalidate
        :aria-label="`${pageTitle}에 댓글 남기기`"
        @submit.prevent="submit"
      >
        <div v-if="replyTo" class="reply-context">
          <div>
            <span class="reply-caption">{{ replyTo.author }} 님에게 답글</span>
            <p>{{ excerpt(replyTo.body) }}</p>
          </div>
          <button
            type="button"
            class="text-button cancel-reply"
            :disabled="submitting"
            @click="cancelReply"
          >
            취소
          </button>
        </div>

        <div class="field name-field">
          <label for="comment-author"
            >이름 <span class="field-hint">가족이 알아볼 수 있게</span></label
          >
          <input
            id="comment-author"
            ref="authorInput"
            v-model="author"
            name="author"
            type="text"
            placeholder="예: 큰딸, 민수"
            autocomplete="nickname"
            maxlength="24"
            required
            :disabled="submitting"
            :aria-invalid="Boolean(authorError)"
            :aria-describedby="authorError ? 'comment-author-error' : undefined"
          />
          <p v-if="authorError" id="comment-author-error" class="field-error" role="alert">
            {{ authorError }}
          </p>
        </div>

        <div class="field">
          <label for="comment-body">{{ replyTo ? '답글' : '남기고 싶은 이야기' }}</label>
          <textarea
            id="comment-body"
            ref="bodyInput"
            v-model="body"
            name="comment"
            :placeholder="
              replyTo
                ? '이 기억에 함께 보태고 싶은 이야기를 적어 주세요.'
                : '“그날은 비가 많이 왔던 기억이 나요.”\n함께 간직하고 싶은 이야기를 적어 주세요.'
            "
            maxlength="2000"
            rows="4"
            required
            :disabled="submitting"
            :aria-invalid="Boolean(bodyError)"
            :aria-describedby="
              bodyError ? 'comment-body-error comment-public-note' : 'comment-public-note'
            "
          />
          <div class="field-bottom">
            <span class="draft-note">이름과 작성 중인 글은 이 기기에 기억해 둬요.</span>
            <span class="character-count" :class="{ 'near-limit': body.length > 1900 }"
              >{{ body.length.toLocaleString('ko-KR') }} / 2,000</span
            >
          </div>
          <p v-if="bodyError" id="comment-body-error" class="field-error" role="alert">
            {{ bodyError }}
          </p>
        </div>

        <p id="comment-public-note" class="public-note">
          이름과 댓글은 이 글을 읽는 분들에게 공개돼요.
        </p>
        <p v-if="submitError" class="message error-message" role="alert">{{ submitError }}</p>
        <p class="announcement" aria-live="polite" aria-atomic="true">{{ announcement }}</p>
        <div class="submit-row">
          <p v-if="cooldownSeconds" class="cooldown-note">
            다음 이야기는 {{ cooldownSeconds }}초 뒤에 남길 수 있어요.
          </p>
          <button
            class="submit-button"
            type="submit"
            :disabled="submitting || cooldownSeconds > 0"
            :aria-busy="submitting"
          >
            <span v-if="submitting" class="spinner" aria-hidden="true" />
            {{ submitting ? '남기는 중…' : replyTo ? '답글 남기기' : '댓글 남기기' }}
            <svg v-if="!submitting" aria-hidden="true" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" />
            </svg>
          </button>
        </div>
      </form>

      <div class="conversation-heading">
        <h3>나눈 이야기</h3>
        <span v-if="comments.length">최근 이야기부터</span>
      </div>

      <div v-if="loading" class="state-card loading-card" role="status">
        <span class="spinner" aria-hidden="true" />이야기를 불러오고 있어요.
      </div>
      <div v-else-if="!comments.length && !loadError" class="state-card empty-state">
        <span class="empty-mark" aria-hidden="true">“</span>
        <p>아직 나눈 이야기가 없어요.</p>
        <span>첫 번째 기억을 들려주세요.</span>
      </div>

      <ol v-if="comments.length" class="comment-list" aria-label="댓글 목록">
        <li
          v-for="comment in comments"
          :id="`comment-${comment.id}`"
          :key="comment.id"
          class="comment-item"
        >
          <article :aria-label="`${comment.author} 님의 ${comment.parentId ? '답글' : '댓글'}`">
            <div class="comment-meta">
              <span class="author-avatar" aria-hidden="true">{{
                [...comment.author][0] || '가'
              }}</span>
              <div class="author-details">
                <strong>{{ comment.author }}</strong
                ><time :datetime="dateTime(comment.createdAt)">{{
                  dateLabel(comment.createdAt)
                }}</time>
              </div>
            </div>
            <div v-if="comment.parentId" class="parent-context">
              <template v-if="commentById.has(comment.parentId)"
                ><span>{{ commentById.get(comment.parentId)?.author }} 님의 이야기에</span>
                <p>{{ excerpt(commentById.get(comment.parentId)?.body || '') }}</p></template
              >
              <span v-else>앞서 남긴 댓글에 보탠 답글</span>
            </div>
            <p class="comment-body">{{ comment.body }}</p>
            <button
              v-if="!comment.parentId"
              class="text-button reply-button"
              type="button"
              :disabled="submitting"
              :aria-label="`${comment.author} 님에게 답글 쓰기`"
              @click="startReply(comment)"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path d="m7 4-4 4 4 4M3 8h7a6 6 0 0 1 6 6v2" /></svg
              >답글 쓰기
            </button>
          </article>
        </li>
      </ol>

      <div v-if="loadError" class="load-error" role="alert">
        <p>{{ loadError }}</p>
        <button
          type="button"
          class="text-button retry-button"
          :disabled="loading || loadingMore"
          @click="loadComments(comments.length > 0)"
        >
          다시 불러오기
        </button>
      </div>
      <button
        v-else-if="hasMore && !loading"
        class="load-more"
        type="button"
        :disabled="loadingMore"
        :aria-busy="loadingMore"
        @click="loadComments(true)"
      >
        <span v-if="loadingMore" class="spinner" aria-hidden="true" />{{
          loadingMore ? '불러오는 중…' : '이전 이야기 더 보기'
        }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.family-comments {
  --comment-ink: #264f40;
  --comment-muted: #6a7069;
  --comment-line: #dedfd4;
  --comment-clay: #9b543c;
  margin: 64px 0 32px;
  padding-top: 40px;
  border-top: 1px solid var(--comment-line);
  scroll-margin-top: 100px;
  color: #283b31;
  outline: none;
}
.comments-heading {
  margin-bottom: 26px;
}
.eyebrow {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--comment-clay);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.comments-heading h2 {
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  color: var(--comment-ink);
  font-size: 28px;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: -0.045em;
}
.comments-heading p {
  margin: 0;
  color: var(--comment-muted);
  font-size: 16px;
  line-height: 1.8;
  word-break: keep-all;
}
.comment-composer {
  padding: 24px;
  border: 1px solid var(--comment-line);
  border-radius: 18px;
  background: #faf9f3;
}
.field + .field {
  margin-top: 20px;
}
.field label {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.5;
}
.field-hint {
  margin-left: 8px;
  color: var(--comment-muted);
  font-size: 13px;
  font-weight: 400;
}
.field input,
.field textarea {
  display: block;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #cbcec2;
  border-radius: 10px;
  color: #283b31;
  background: #fffefa;
  font-family: inherit;
  font-size: 18px;
  font-weight: 400;
  line-height: 1.65;
  box-sizing: border-box;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.field input {
  min-height: 52px;
  max-width: 340px;
}
.field textarea {
  min-height: 154px;
  resize: vertical;
}
.field input::placeholder,
.field textarea::placeholder {
  color: var(--comment-muted);
  opacity: 1;
}
.field input:focus,
.field textarea:focus {
  outline: 2px solid var(--comment-ink);
  outline-offset: 2px;
  border-color: var(--comment-ink);
}
.field input[aria-invalid='true'],
.field textarea[aria-invalid='true'] {
  border-color: #a64032;
}
.field input:disabled,
.field textarea:disabled {
  opacity: 0.65;
}
.field-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-top: 7px;
  color: var(--comment-muted);
  font-size: 12px;
  line-height: 1.6;
}
.character-count {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.near-limit {
  color: var(--comment-clay);
}
.field-error,
.error-message {
  margin: 8px 0 0;
  color: #943629;
  font-size: 14px;
  line-height: 1.7;
}
.public-note {
  margin: 20px 0 0;
  color: var(--comment-muted);
  font-size: 13px;
  line-height: 1.7;
  word-break: keep-all;
}
.announcement {
  margin: 10px 0 0;
  color: var(--comment-ink);
  font-size: 14px;
  line-height: 1.7;
}
.announcement:empty {
  margin: 0;
}
.submit-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}
.submit-button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 12px 22px;
  border: 1px solid var(--comment-ink);
  border-radius: 10px;
  color: #fffdf5;
  background: var(--comment-ink);
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.5;
  cursor: pointer;
}
.submit-button svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.submit-button:hover:not(:disabled) {
  background: #1b3d30;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--comment-clay);
  outline-offset: 4px;
}
.cooldown-note {
  flex: 1;
  margin: 0;
  color: var(--comment-muted);
  font-size: 12px;
  line-height: 1.6;
}
.reply-context {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding: 12px 0 12px 14px;
  border-left: 3px solid #b77c5d;
}
.reply-context > div {
  min-width: 0;
}
.reply-caption {
  color: var(--comment-clay);
  font-size: 14px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.reply-context p {
  margin: 4px 0 0;
  color: var(--comment-muted);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.text-button {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--comment-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
  cursor: pointer;
  text-decoration: none;
}
.text-button:hover:not(:disabled) {
  background: #edf0e6;
}
.cancel-reply {
  flex: 0 0 auto;
  margin-top: -8px;
}
.conversation-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin: 34px 0 8px;
}
.conversation-heading h3 {
  margin: 0;
  color: var(--comment-ink);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.025em;
}
.conversation-heading > span {
  color: var(--comment-muted);
  font-size: 12px;
}
.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  border-radius: 14px;
  background: #f3f3eb;
  color: var(--comment-muted);
  font-size: 15px;
  line-height: 1.8;
  text-align: center;
}
.state-card p {
  margin: 0;
}
.state-card > svg {
  width: 30px;
  height: 30px;
  stroke: #839781;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.loading-card {
  flex-direction: row;
}
.empty-state {
  gap: 4px;
  background: transparent;
}
.empty-state > span:last-child {
  font-size: 14px;
}
.empty-mark {
  height: 34px;
  color: #a3af99;
  font:
    54px/1 Georgia,
    serif;
}
.comment-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.comment-item {
  margin: 0;
  padding: 24px 0 15px;
  border-bottom: 1px solid #e5e5dc;
  scroll-margin-top: 100px;
}
.comment-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.author-avatar {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #e9edde;
  color: #526649;
  font-size: 14px;
  font-weight: 600;
}
.author-details {
  display: flex;
  flex: 1;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  min-width: 0;
}
.author-details strong {
  color: #283b31;
  font-size: 15px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.author-details time {
  color: var(--comment-muted);
  font-size: 12px;
  line-height: 1.6;
}
.comment-body {
  margin: 14px 0 0;
  color: #354438;
  font-size: 17px;
  line-height: 1.85;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reply-button {
  margin: 6px 0 0 -10px;
  color: #5e705b;
}
.reply-button svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.parent-context {
  margin-top: 14px;
  padding: 8px 12px;
  border-left: 2px solid #c5cbbb;
  background: #f4f5ee;
  color: var(--comment-muted);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.parent-context p {
  margin: 2px 0 0;
  font-size: 13px;
}
.load-more {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 50px;
  margin-top: 20px;
  padding: 12px;
  border: 1px solid var(--comment-line);
  border-radius: 10px;
  background: #faf9f3;
  color: var(--comment-ink);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.load-more:hover:not(:disabled) {
  background: #edf0e6;
}
.load-error {
  margin-top: 20px;
  padding: 16px;
  border-radius: 10px;
  background: #f8ede5;
  color: #85452f;
  font-size: 14px;
  line-height: 1.7;
}
.load-error p {
  margin: 0;
}
.retry-button {
  margin-left: -10px;
  color: #85452f;
}
.spinner {
  display: inline-block;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: comment-spin 0.75s linear infinite;
}
@keyframes comment-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .family-comments {
    margin-top: 44px;
    padding-top: 30px;
  }
  .comments-heading h2 {
    font-size: 26px;
  }
  .comments-heading p {
    font-size: 15px;
  }
  .desktop-break {
    display: none;
  }
  .comment-composer {
    padding: 18px 16px;
    border-radius: 14px;
  }
  .field input {
    max-width: none;
  }
  .field-hint {
    font-size: 12px;
  }
  .field-bottom {
    flex-wrap: wrap;
    gap: 4px;
  }
  .draft-note {
    flex: 1 1 200px;
  }
  .character-count {
    margin-left: auto;
  }
  .submit-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .submit-button {
    width: 100%;
    min-height: 52px;
    font-size: 17px;
  }
  .cooldown-note {
    text-align: center;
  }
  .author-details {
    display: block;
  }
  .author-details time {
    display: block;
    margin-top: 2px;
  }
  .comment-body {
    font-size: 17px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 1.5s;
  }
  .field input,
  .field textarea {
    transition: none;
  }
}
</style>
