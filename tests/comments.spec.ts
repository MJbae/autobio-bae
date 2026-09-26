import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const PROJECT = 'demo-family-library'
const FIRESTORE = 'http://127.0.0.1:8080'
const AUTH = 'http://127.0.0.1:9099'
const documentsBase = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`
const commentsFor = (pageId: string) => `${documentsBase}/pages/${pageId}/comments`

async function openComments(page: Page, decade = '1930') {
  await page.goto(`/read/${decade}s.html#comments`)
  await page.locator('#comments').scrollIntoViewIfNeeded()
  await expect(page.locator('.comment-composer')).toBeVisible()
  await expect(page.locator('.comments-status')).toHaveCount(0)
}

async function showComments(page: Page) {
  await page.locator('#comments').scrollIntoViewIfNeeded()
  await expect(page.locator('.comment-composer')).toBeVisible()
  await expect(page.locator('.comments-status')).toHaveCount(0)
}

async function storedComments(request: APIRequestContext, pageId = 'life-1930s') {
  const response = await request.get(commentsFor(pageId), {
    headers: { Authorization: 'Bearer owner' },
  })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()).documents ?? []) as Array<{
    name: string
    fields: Record<string, { stringValue?: string; timestampValue?: string; nullValue?: null }>
  }>
}

test.beforeEach(async ({ request }) => {
  // These are explicitly local demo data only. This suite never uses a real
  // Firebase project or credentials, even when a developer has .env.local.
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080')
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099')
  const clearDocuments = await request.delete(
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`
  )
  expect(clearDocuments.ok()).toBeTruthy()
  const clearAccounts = await request.delete(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`)
  expect(clearAccounts.ok()).toBeTruthy()
})

test('a mobile visitor posts without signing in; another browser reads the stored comment and replies', async ({
  page,
  browser,
  request,
}) => {
  const original = '독정리로 이사하던 날 비가 많이 왔어요.\n이삿짐을 함께 옮겼던 기억이 나요.'
  await openComments(page)
  await expect(page.locator('.comment-item')).toHaveCount(0)
  await page.getByLabel(/^이름/).fill('큰딸')
  await page.getByLabel('남기고 싶은 이야기', { exact: true }).fill(original)
  await page
    .locator('.comment-composer')
    .getByRole('button', { name: '댓글 남기기', exact: true })
    .click()
  await expect(
    page.getByRole('article', { name: '큰딸 님의 댓글' }).locator('.comment-body')
  ).toHaveText(original)
  await expect(page.locator('.announcement')).toContainText('댓글을 남겼어요.')
  await expect(page.getByLabel('남기고 싶은 이야기', { exact: true })).toHaveValue('')
  await expect(page.locator('.comment-composer button[type="submit"]')).toBeDisabled()

  const originalDocs = await storedComments(request)
  expect(originalDocs).toHaveLength(1)
  expect(originalDocs[0].fields.body.stringValue).toBe(original)
  expect(originalDocs[0].fields.createdAt.timestampValue).toBeTruthy()
  expect(originalDocs[0].fields.uid.stringValue).toBeTruthy()
  const originalId = originalDocs[0].name.split('/').at(-1)

  const familyContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    reducedMotion: 'reduce',
    baseURL: 'http://127.0.0.1:4175',
  })
  try {
    const familyPage = await familyContext.newPage()
    await openComments(familyPage)
    await expect(
      familyPage.getByRole('article', { name: '큰딸 님의 댓글' }).locator('.comment-body')
    ).toHaveText(original)
    await expect(familyPage.getByLabel(/^이름/)).toHaveValue('')
    await familyPage.getByRole('button', { name: '큰딸 님에게 답글 쓰기', exact: true }).click()
    await familyPage.getByLabel(/^이름/).fill('막내')
    await familyPage
      .getByLabel('답글', { exact: true })
      .fill('맞아요. 저도 우산을 들고 마중 나갔어요.')
    await familyPage.getByRole('button', { name: '답글 남기기', exact: true }).click()
    const reply = familyPage.getByRole('article', { name: '막내 님의 답글' })
    await expect(reply.locator('.comment-body')).toHaveText(
      '맞아요. 저도 우산을 들고 마중 나갔어요.'
    )
    await expect(reply.locator('.parent-context')).toContainText('큰딸 님에게 답글')
    await expect(reply.getByRole('button', { name: /답글 쓰기/ })).toHaveCount(0)

    const saved = await storedComments(request)
    expect(saved).toHaveLength(2)
    const savedReply = saved.find((comment) => comment.fields.author.stringValue === '막내')!
    expect(savedReply.fields.parentId.stringValue).toBe(originalId)
    expect(savedReply.fields.uid.stringValue).not.toBe(originalDocs[0].fields.uid.stringValue)

    await page.reload()
    await page.locator('#comments').scrollIntoViewIfNeeded()
    await expect(page.getByRole('article', { name: '막내 님의 답글' })).toBeVisible()
    await expect(page.getByLabel(/^이름/)).toHaveValue('큰딸')
  } finally {
    await familyContext.close()
  }
})

test('names survive reloads, drafts stay with their article, and posted comments do not leak into another article', async ({
  page,
  request,
}) => {
  const draft = '1930년대 이야기는 큰아버지께 확인하고 싶어요.'
  const published = '1940년대에는 갯벌에서 자주 놀았다고 들었어요.'
  await openComments(page)
  await page.getByLabel(/^이름/).fill('큰아들')
  await page.getByLabel('남기고 싶은 이야기', { exact: true }).fill(draft)
  await page.reload()
  await page.locator('#comments').scrollIntoViewIfNeeded()
  await expect(page.getByLabel(/^이름/)).toHaveValue('큰아들')
  await expect(page.getByLabel('남기고 싶은 이야기', { exact: true })).toHaveValue(draft)

  await page
    .getByRole('navigation', { name: '앞뒤 이야기' })
    .getByRole('link', { name: /다음 이야기/ })
    .click()
  await expect(page).toHaveURL(/\/read\/1940s\.html$/)
  await showComments(page)
  await expect(page.getByLabel(/^이름/)).toHaveValue('큰아들')
  await expect(page.getByLabel('남기고 싶은 이야기', { exact: true })).toHaveValue('')
  await page.getByLabel('남기고 싶은 이야기', { exact: true }).fill(published)
  await page
    .locator('.comment-composer')
    .getByRole('button', { name: '댓글 남기기', exact: true })
    .click()
  await expect(page.locator('.comment-body')).toHaveText(published)

  await page
    .getByRole('navigation', { name: '앞뒤 이야기' })
    .getByRole('link', { name: /이전 이야기/ })
    .click()
  await expect(page).toHaveURL(/\/read\/1930s\.html$/)
  await showComments(page)
  await expect(page.getByLabel('남기고 싶은 이야기', { exact: true })).toHaveValue(draft)
  await expect(page.locator('.comment-item')).toHaveCount(0)
  expect(await storedComments(request, 'life-1930s')).toHaveLength(0)
  expect(await storedComments(request, 'life-1940s')).toHaveLength(1)
})

test('empty fields are explained and HTML in a posted name or comment is displayed as plain text', async ({
  page,
  request,
}) => {
  await openComments(page)
  await page
    .locator('.comment-composer')
    .getByRole('button', { name: '댓글 남기기', exact: true })
    .click()
  await expect(page.getByText('이름을 적어 주세요.', { exact: true })).toBeVisible()
  await expect(page.getByText('남기고 싶은 이야기를 적어 주세요.', { exact: true })).toBeVisible()
  await expect(page.getByLabel(/^이름/)).toBeFocused()
  expect(await storedComments(request)).toHaveLength(0)

  const untrustedName = '<b>엄마</b>'
  const untrustedBody =
    '<img src=x onerror="window.commentInjected=true"><script>window.commentInjected=true</script>\n이 글자는 그대로 보여야 해요.'
  await page.getByLabel(/^이름/).fill(untrustedName)
  await page.getByLabel('남기고 싶은 이야기', { exact: true }).fill(untrustedBody)
  await page
    .locator('.comment-composer')
    .getByRole('button', { name: '댓글 남기기', exact: true })
    .click()
  await expect(page.locator('.comment-body')).toHaveText(untrustedBody)
  await expect(page.locator('.comment-meta strong')).toHaveText(untrustedName)
  await expect(
    page.locator('.comment-list img, .comment-list script, .comment-list b')
  ).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, 'commentInjected'))).toBeUndefined()
  const saved = await storedComments(request)
  expect(saved[0].fields.body.stringValue).toBe(untrustedBody)
})

test('older comments load in bounded pages without duplicate entries', async ({
  page,
  request,
}) => {
  await Promise.all(
    Array.from({ length: 31 }, async (_, index) => {
      const response = await request.patch(`${commentsFor('life-1930s')}/seed-${index}`, {
        headers: { Authorization: 'Bearer owner' },
        data: {
          fields: {
            author: { stringValue: '가족' },
            body: { stringValue: `기억 ${index + 1}` },
            parentId: { nullValue: null },
            uid: { stringValue: 'local-emulator-fixture' },
            createdAt: { timestampValue: new Date(Date.UTC(2020, 0, 1, 0, index)).toISOString() },
          },
        },
      })
      expect(response.ok()).toBeTruthy()
    })
  )
  await openComments(page)
  await expect(page.locator('.comment-item')).toHaveCount(30)
  await expect(page.locator('.comment-body').first()).toHaveText('기억 31')
  await expect(page.locator('.comment-body').last()).toHaveText('기억 2')
  await page.getByRole('button', { name: '이전 이야기 더 보기', exact: true }).click()
  await expect(page.locator('.comment-item')).toHaveCount(31)
  await expect(page.locator('.comment-body').last()).toHaveText('기억 1')
  await expect(page.getByRole('button', { name: '이전 이야기 더 보기', exact: true })).toHaveCount(
    0
  )
  const ids = await page
    .locator('.comment-item')
    .evaluateAll((items) => items.map((item) => item.id))
  expect(new Set(ids).size).toBe(31)
})
