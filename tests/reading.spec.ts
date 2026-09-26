import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('간결한 이야기 목록에서 연대를 골라 원문을 읽는다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '아버지의 이야기', exact: true })).toBeVisible()
  const chapters = page.getByRole('navigation', { name: '연대별 이야기', exact: true })
  await expect(chapters.locator('a.chapter-row')).toHaveCount(10)
  await expect(page.locator('.resume-link')).toHaveCount(0)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(page.getByRole('group', { name: '자료 종류' })).toHaveCount(0)
  await expect(page.locator('#documents')).toHaveCount(0)
  await expect(page.locator('.site-footer, .mobile-reader-bar')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/${info.project.name}-home.png`, fullPage: true })

  const firstChapter = chapters.getByRole('link', { name: /1930년대.*안면도 중장리의 막내/ })
  const touchTarget = await firstChapter.boundingBox()
  expect(touchTarget?.height).toBeGreaterThanOrEqual(44)
  await firstChapter.click()
  await expect(page).toHaveURL(/\/read\/1930s\.html$/)
  await expect(page.locator('.story-content')).toContainText(
    '1936년 안면도 중장리에서 3남 2녀 중 막내로 태어났다'
  )
  await expect(page.locator('.article-header h1')).toHaveText('안면도 중장리의 막내')
  await expect(page.locator('.story-content h1')).toBeHidden()
  await expect(page.getByRole('link', { name: '목록', exact: true })).toBeVisible()
  await expect(page.locator('#comments')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /댓글/ })).toHaveCount(0)
  await expect(page.getByText(/댓글을 준비하고 있어요/)).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/${info.project.name}-reader.png`, fullPage: true })
  expect(errors).toEqual([])
})

test('큰 글씨와 읽던 위치를 기억하고 목차로 본문에 이동한다', async ({ page }) => {
  await page.goto('read/1980s.html')
  await expect(page.locator('.story-content')).toContainText('새마을정미소')
  await page.getByRole('button', { name: '글자 크기', exact: true }).click()
  const settings = page.locator('.reading-settings')
  await expect(settings).toBeVisible()
  await settings.getByRole('button', { name: '더 크게', exact: true }).click()
  await expect(page.locator('.library')).toHaveClass(/font-2/)
  await page.reload()
  await expect(page.locator('.library')).toHaveClass(/font-2/)
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: '목차', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '목차', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '창고를 짓기 전, 방수포 아래의 벼를 지키다' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page).toHaveURL(/#.+/)
  await expect
    .poll(async () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('family-library:reading') || 'null')?.progress
      )
    )
    .toBeGreaterThan(0)
  const previous = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('family-library:reading') || '{}')
  )
  await page.locator('.back-link').click()
  await expect(page.locator('.resume-link')).toBeVisible()
  await page.locator('.resume-link').click()
  await expect(page).toHaveURL(/1980s\.html/)
  await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(previous.scroll * 0.8)
  await expect(page.locator('#comments')).toHaveCount(0)
})

test('키보드로 읽기 설정을 열고 목차를 닫을 수 있다', async ({ page }) => {
  await page.goto('read/1980s.html')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '목록', exact: true })).toBeFocused()

  const fontTrigger = page.getByRole('button', { name: '글자 크기', exact: true })
  await fontTrigger.focus()
  await page.keyboard.press('Enter')
  const settings = page.locator('.reading-settings')
  await expect(settings).toBeVisible()
  await settings.getByRole('button', { name: '보통', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.library')).toHaveClass(/font-0/)
  await expectNoHorizontalOverflow(page)
  await page.keyboard.press('Escape')

  const tocTrigger = page.getByRole('button', { name: '목차', exact: true })
  await tocTrigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '목차', exact: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(tocTrigger).toBeFocused()
})

test('전체 글을 한 번에 읽고 잘못된 주소에서 목록으로 돌아온다', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: '전체 이야기 읽기', exact: true }).click()
  await expect(page).toHaveURL(/\/read\/life-story\.html$/)
  await expect(page.locator('.story-content')).toContainText('이 연대기를 움직이는 인과')
  await expect(page.locator('.story-content')).toContainText('약 1,000ha')
  await expectNoHorizontalOverflow(page)

  await page.goto('missing-page.html')
  await expect(page.getByRole('heading', { name: '이야기를 찾지 못했습니다.' })).toBeVisible()
  await page.getByRole('link', { name: '목록으로 돌아가기', exact: true }).click()
  await expect(page.locator('.chapter-row')).toHaveCount(10)
})
