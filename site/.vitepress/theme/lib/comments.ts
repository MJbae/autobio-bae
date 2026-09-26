import { getApps, initializeApp } from 'firebase/app'
import { configuration, isCommentsConfigured } from './firebase-config'
export { isCommentsConfigured } from './firebase-config'
import { connectAuthEmulator, getAuth, signInAnonymously, type Auth } from 'firebase/auth'
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

export type FamilyComment = {
  id: string
  author: string
  body: string
  parentId: string | null
  createdAt: number
}

type CommentInput = Pick<FamilyComment, 'author' | 'body' | 'parentId'>
type CommentCursor = {
  pageId: string
  snapshot: QueryDocumentSnapshot<DocumentData>
}

const PAGE_SIZE = 30
const COOLDOWN_MS = 15_000
const VALID_ID = /^[A-Za-z0-9_-]{1,120}$/

let clients: { auth: Auth; db: Firestore } | undefined
let signingIn: ReturnType<typeof signInAnonymously> | undefined

function getClients() {
  if (typeof window === 'undefined') {
    throw new Error('댓글은 브라우저에서 이용할 수 있어요.')
  }
  if (!isCommentsConfigured()) {
    throw new Error('댓글 기능을 준비하고 있어요. 조금 뒤에 다시 방문해 주세요.')
  }
  if (clients) return clients

  const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  if (useEmulators && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    throw new Error('댓글 연결 설정을 확인해야 해요. 운영자에게 알려 주세요.')
  }

  const existingApp = getApps().find((app) => app.name === 'family-comments')
  const app = existingApp ?? initializeApp(configuration, 'family-comments')
  const auth = getAuth(app)
  const db = getFirestore(app)
  // A named app also survives Vite hot reloads; connect its emulators only once.
  if (useEmulators && !existingApp) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  clients = { auth, db }
  return clients
}

function validatePageId(pageId: string) {
  if (!VALID_ID.test(pageId)) {
    throw new Error('이 글의 댓글 주소를 확인해야 해요. 운영자에게 알려 주세요.')
  }
}

function readableError(error: unknown, writing: boolean): Error {
  if (error instanceof Error && !('code' in error)) return error
  const code = (error as { code?: string })?.code ?? ''
  if (code.includes('permission-denied')) {
    return new Error(
      writing
        ? '등록하지 못했어요. 방금 댓글을 남겼다면 15초 뒤에 다시 시도해 주세요. 계속되면 운영자에게 알려 주세요.'
        : '댓글을 불러올 수 없어요. 운영자에게 알려 주세요.'
    )
  }
  if (
    code.includes('operation-not-allowed') ||
    code.includes('invalid-api-key') ||
    code.includes('unauthorized-domain')
  ) {
    return new Error('댓글 연결을 준비하고 있어요. 운영자에게 알려 주세요.')
  }
  if (code.includes('too-many-requests') || code.includes('resource-exhausted')) {
    return new Error('잠시 이용이 많아 댓글을 처리하지 못했어요. 조금 뒤에 다시 시도해 주세요.')
  }
  if (
    code.includes('network-request-failed') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded')
  ) {
    return new Error(
      '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 작성한 내용은 그대로 남아 있어요.'
    )
  }
  return new Error(
    writing
      ? '댓글을 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
      : '댓글을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  )
}

function toComment(snapshot: QueryDocumentSnapshot<DocumentData>): FamilyComment {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    author: data.author,
    body: data.body,
    parentId: data.parentId,
    createdAt: data.createdAt.toMillis(),
  }
}

export async function fetchComments(
  pageId: string,
  cursor?: unknown
): Promise<{
  comments: FamilyComment[]
  cursor: unknown
  hasMore: boolean
}> {
  validatePageId(pageId)
  try {
    const { db } = getClients()
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)]
    if (cursor) {
      const previous = cursor as CommentCursor
      if (previous.pageId !== pageId || !previous.snapshot) {
        throw new Error('댓글 목록을 새로 불러온 뒤 다시 시도해 주세요.')
      }
      constraints.push(startAfter(previous.snapshot))
    }
    // One bounded read per request, rather than a permanent realtime listener.
    const result = await getDocsFromServer(
      query(collection(db, 'pages', pageId, 'comments'), ...constraints)
    )
    return {
      comments: result.docs.map(toComment),
      cursor: result.empty ? null : { pageId, snapshot: result.docs[result.docs.length - 1] },
      hasMore: result.size === PAGE_SIZE,
    }
  } catch (error) {
    throw readableError(error, false)
  }
}

export async function postComment(pageId: string, input: CommentInput): Promise<FamilyComment> {
  validatePageId(pageId)
  const author = input.author.trim()
  const body = input.body.trim()
  const parentId = input.parentId
  if (!author || author.length > 24 || /[\r\n]/.test(author)) {
    throw new Error('이름은 한 줄로 1~24자까지 적어 주세요.')
  }
  if (!body || body.length > 2000) {
    throw new Error('댓글은 1~2,000자까지 적어 주세요.')
  }
  if (parentId !== null && !VALID_ID.test(parentId)) {
    throw new Error('답글을 남길 댓글을 다시 선택해 주세요.')
  }

  try {
    const { auth, db } = getClients()
    if (parentId) {
      const parent = await getDocFromServer(doc(db, 'pages', pageId, 'comments', parentId))
      if (!parent.exists() || parent.data().parentId !== null) {
        throw new Error('답글을 남길 댓글이 없어졌어요. 답글을 취소하고 새 댓글로 남겨 주세요.')
      }
    }
    // Reading never creates an anonymous account. Restore the existing session
    // before creating one, so reloading does not circumvent the same-UID limit.
    await auth.authStateReady()
    let user = auth.currentUser
    if (!user) {
      signingIn ??= signInAnonymously(auth).finally(() => {
        signingIn = undefined
      })
      user = (await signingIn).user
    }

    const rateRef = doc(db, 'rateLimits', user.uid)
    const rate = await getDocFromServer(rateRef)
    const previousTime = rate.data()?.lastCommentAt?.toMillis() ?? 0
    const elapsed = Date.now() - previousTime
    const waitSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
    // A device clock behind the server must not lock the visitor out. Rules
    // remain authoritative when device time cannot support this friendly check.
    if (elapsed >= 0 && waitSeconds > 0) {
      throw new Error(
        `잠시만요. ${waitSeconds}초 뒤에 댓글을 남길 수 있어요. 작성한 내용은 그대로 남아 있어요.`
      )
    }

    const commentRef = doc(collection(db, 'pages', pageId, 'comments'))
    const batch = writeBatch(db)
    batch.set(commentRef, { author, body, parentId, uid: user.uid, createdAt: serverTimestamp() })
    batch.set(rateRef, {
      lastCommentAt: serverTimestamp(),
      lastCommentId: commentRef.id,
      lastPageId: pageId,
    })
    // Rules require this pair of writes and enforce the cooldown atomically.
    await batch.commit()

    // The acknowledged write includes the resolved server timestamp in the
    // memory cache. A cache miss must not report a successful post as a failure.
    let createdAt = Date.now()
    try {
      const saved = await getDocFromCache(commentRef)
      createdAt = saved.data()?.createdAt?.toMillis() ?? createdAt
    } catch {
      /* The next refresh will retrieve the canonical server timestamp. */
    }
    return { id: commentRef.id, author, body, parentId, createdAt }
  } catch (error) {
    throw readableError(error, true)
  }
}
