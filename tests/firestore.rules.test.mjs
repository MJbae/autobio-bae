import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const PAGE = 'chronology'
const UID = 'family-member'
let environment

before(async () => {
  const hostAddress = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  const [host, port] = hostAddress.split(':')
  environment = await initializeTestEnvironment({
    projectId: 'demo-family-library',
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
})
after(async () => {
  await environment?.cleanup()
})

function anonymousDb(uid = UID) {
  return environment
    .authenticatedContext(uid, {
      firebase: { sign_in_provider: 'anonymous', identities: {} },
    })
    .firestore()
}

function commentRef(db, page = PAGE, id = 'new-comment') {
  return doc(db, 'pages', page, 'comments', id)
}

function commentData(overrides = {}) {
  return {
    author: '큰딸',
    body: '그때 저도 함께 갔어요.\n비가 왔던 기억이 나요.',
    parentId: null,
    uid: UID,
    createdAt: serverTimestamp(),
    ...overrides,
  }
}

function submission(db, { page = PAGE, id = 'new-comment', uid = UID, overrides = {} } = {}) {
  const batch = writeBatch(db)
  batch.set(commentRef(db, page, id), commentData({ uid, ...overrides }))
  batch.set(doc(db, 'rateLimits', uid), {
    lastCommentAt: serverTimestamp(),
    lastCommentId: id,
    lastPageId: page,
  })
  return batch
}

async function seedComments() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(
      commentRef(db, PAGE, 'parent'),
      commentData({ createdAt: Timestamp.fromMillis(1_000) })
    )
    await setDoc(
      commentRef(db, 'other-page', 'elsewhere'),
      commentData({ createdAt: Timestamp.fromMillis(1_000) })
    )
    await setDoc(
      commentRef(db, PAGE, 'existing-reply'),
      commentData({ parentId: 'parent', createdAt: Timestamp.fromMillis(2_000) })
    )
  })
}

test('visitors can read one comment and a bounded latest-first page without signing in', async () => {
  await seedComments()
  const db = environment.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(commentRef(db, PAGE, 'parent')))
  const result = await assertSucceeds(
    getDocs(
      query(collection(db, 'pages', PAGE, 'comments'), orderBy('createdAt', 'desc'), limit(30))
    )
  )
  assert.equal(result.size, 2)
  assert.equal(result.docs[0].id, 'existing-reply')
})

test('unbounded queries, oversized pages, and rate-limit reads are denied to visitors', async () => {
  const db = environment.unauthenticatedContext().firestore()
  await assertFails(getDocs(collection(db, 'pages', PAGE, 'comments')))
  await assertFails(getDocs(query(collection(db, 'pages', PAGE, 'comments'), limit(31))))
  await assertFails(getDoc(doc(db, 'rateLimits', UID)))
})

test('an anonymous visitor can atomically post a valid multiline comment and its server timestamp', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  const saved = (await getDoc(commentRef(db))).data()
  assert.equal(saved.author, '큰딸')
  assert.ok(saved.createdAt instanceof Timestamp)
  const rate = (await getDoc(doc(db, 'rateLimits', UID))).data()
  assert.equal(rate.lastCommentAt.toMillis(), saved.createdAt.toMillis())
})

test('unsigned and non-anonymous accounts cannot submit comments', async () => {
  await assertFails(submission(environment.unauthenticatedContext().firestore()).commit())
  const signedIn = environment
    .authenticatedContext(UID, { firebase: { sign_in_provider: 'password', identities: {} } })
    .firestore()
  await assertFails(submission(signedIn).commit())
})

test('direct writes without the paired cooldown record and forged UIDs are rejected', async () => {
  const db = anonymousDb()
  await assertFails(setDoc(commentRef(db), commentData()))
  await assertFails(submission(db, { overrides: { uid: 'someone-else' } }).commit())
  await assertFails(submission(db, { uid: 'someone-else' }).commit())
})

test('required fields, extra fields, empty input, and input size limits are enforced by the server', async () => {
  const db = anonymousDb()
  for (const overrides of [
    { author: '' },
    { author: '   ' },
    { author: 'a'.repeat(25) },
    { author: 'first\nsecond' },
    { body: '' },
    { body: ' \n\t ' },
    { body: 'a'.repeat(2001) },
    { body: 42 },
    { admin: true },
    { createdAt: Timestamp.fromMillis(0) },
  ]) {
    await assertFails(submission(db, { overrides }).commit())
  }
  const batch = writeBatch(db)
  const missing = commentData()
  delete missing.parentId
  batch.set(commentRef(db), missing)
  batch.set(doc(db, 'rateLimits', UID), {
    lastCommentAt: serverTimestamp(),
    lastCommentId: 'new-comment',
    lastPageId: PAGE,
  })
  await assertFails(batch.commit())
})

test('the maximum name and body lengths are accepted', async () => {
  await assertSucceeds(
    submission(anonymousDb(), {
      overrides: { author: 'a'.repeat(24), body: '가'.repeat(2000) },
    }).commit()
  )
})

test('a reply must point to an existing top-level comment on the same page', async () => {
  await seedComments()
  const db = anonymousDb()
  for (const parentId of ['missing', 'elsewhere', 'existing-reply', 'new-comment', 123]) {
    await assertFails(submission(db, { overrides: { parentId } }).commit())
  }
  await assertSucceeds(submission(db, { overrides: { parentId: 'parent' } }).commit())
})

test('a second comment within 15 seconds is rejected even on another page', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  await assertFails(submission(db, { page: 'other-page', id: 'too-soon' }).commit())
  assert.equal((await getDoc(commentRef(db, 'other-page', 'too-soon'))).exists(), false)
})

test('a visitor can comment again after the server cooldown has elapsed', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'rateLimits', UID), {
      lastCommentAt: Timestamp.fromMillis(Date.now() - 60_000),
      lastCommentId: 'older-comment',
      lastPageId: PAGE,
    })
  })
  await assertSucceeds(submission(anonymousDb()).commit())
})

test('a single rate record cannot authorize multiple comments in the same batch', async () => {
  const db = anonymousDb()
  const batch = submission(db)
  batch.set(commentRef(db, PAGE, 'extra-comment'), commentData())
  await assertFails(batch.commit())
})

test('rate records cannot be created independently, forged, erased, or read by another visitor', async () => {
  const db = anonymousDb()
  await assertFails(
    setDoc(doc(db, 'rateLimits', UID), {
      lastCommentAt: serverTimestamp(),
      lastCommentId: 'missing',
      lastPageId: PAGE,
    })
  )
  await assertSucceeds(submission(db).commit())
  await assertFails(
    updateDoc(doc(db, 'rateLimits', UID), { lastCommentAt: Timestamp.fromMillis(0) })
  )
  await assertFails(deleteDoc(doc(db, 'rateLimits', UID)))
  await assertFails(getDoc(doc(anonymousDb('another-member'), 'rateLimits', UID)))
  await assertFails(getDocs(query(collection(db, 'rateLimits'), limit(10))))
})

test('even the author cannot edit/delete comments or write unrelated documents', async () => {
  const db = anonymousDb()
  await assertSucceeds(submission(db).commit())
  await assertFails(updateDoc(commentRef(db), { body: 'changed' }))
  await assertFails(deleteDoc(commentRef(db)))
  await assertFails(setDoc(doc(db, 'pages', PAGE), { published: true }))
  await assertFails(setDoc(doc(db, 'private', 'settings'), { admin: true }))
})
