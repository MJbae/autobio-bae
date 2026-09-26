import { expect, test } from '@playwright/test'

test('모바일 서재에서 실제 원문을 읽고 자료를 찾는다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '한 사람의 삶, 우리의 이야기.' })).toBeVisible()
  await expect(page.locator('.chapter-card')).toHaveCount(10)
  await expect(page.locator('.document-card')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/${info.project.name}-home.png`, fullPage: true })

  await page.getByLabel('제목과 소개에서 찾기').fill('1970')
  await expect(page.locator('.chapter-card')).toHaveCount(1)
  await expect(page.locator('.chapter-card')).toContainText('독정리')
  await page.getByLabel('제목과 소개에서 찾기').fill('없는검색어')
  await expect(page.getByRole('status')).toContainText('찾는 이야기가 없어요')
  await page.getByLabel('제목과 소개에서 찾기').clear()
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: '이야기', exact: true }).click()
    await expect(page.locator('#documents')).toHaveCount(0)
    await page.getByRole('link', { name: '모아둔 자료', exact: true }).click()
    await expect(page.locator('#documents')).toBeVisible()
  }
  await page.getByRole('link', { name: '첫 이야기 읽기' }).click()
  await expect(page).toHaveURL(/\/read\/1930s\.html$/)
  await expect(page.locator('.story-content')).toContainText(
    '1936년 안면도 중장리에서 3남 2녀 중 막내로 태어났다'
  )
  await expect(page.locator('.article-header h1')).toHaveText('안면도 중장리의 막내')
  await expect(page.locator('.story-content h1')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(async () => page.evaluate(() => scrollY)).toBe(0)
  await page.screenshot({ path: `test-results/${info.project.name}-reader.png`, fullPage: true })
  expect(errors).toEqual([])
})

test('글자 크기·목차·읽던 위치를 기억하고 준비 중 댓글을 정직하게 표시한다', async ({
  page,
}, info) => {
  await page.goto('read/1980s.html')
  await expect(page.locator('.story-content')).toContainText('새마을정미소')
  await page.locator('.font-button').click()
  await expect(page.locator('.library')).toHaveClass(/font-2/)
  await page.reload()
  await expect(page.locator('.library')).toHaveClass(/font-2/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  if (info.project.name !== 'desktop') {
    await page.getByRole('button', { name: '목차', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '창고를 짓기 전, 방수포 아래의 벼를 지키다' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page).toHaveURL(/#.+/)
  } else {
    await page
      .locator('.reader-toc')
      .getByRole('button', { name: '창고를 짓기 전, 방수포 아래의 벼를 지키다' })
      .click()
  }
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
  await page.locator('.brand').click()
  await expect(page.locator('.resume-card')).toBeVisible()
  await page.locator('.resume-card').click()
  await expect(page).toHaveURL(/1980s\.html/)
  await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(previous.scroll * 0.8)

  await page.locator('#comments').scrollIntoViewIfNeeded()
  await expect(page.locator('.family-comments')).toContainText('댓글을 준비하고 있어요')
  await expect(page.locator('.family-comments form')).toHaveCount(0)
  expect(await page.locator('[id="comments"]').count()).toBe(1)
})

test('전체 글과 추가 자료 및 잘못된 주소의 안내', async ({ page }) => {
  await page.goto('read/life-story.html')
  await expect(page.locator('.story-content')).toContainText('이 연대기를 움직이는 인과')
  await expect(page.locator('.story-content')).toContainText('약 1,000ha')
  await page.goto('./')
  await page.locator('.document-card').click()
  await expect(page.locator('.article-header h1')).toHaveText('이 서재를 함께 채우는 방법')
  await expect(page.locator('.story-content')).toContainText(
    '회원가입이나 이메일 인증은 필요 없습니다'
  )
  await page.goto('missing-page.html')
  await expect(page.getByRole('heading', { name: '이야기를 찾지 못했어요.' })).toBeVisible()
  await page.getByRole('link', { name: '서재로 돌아가기', exact: true }).click()
  await expect(page.locator('.chapter-card')).toHaveCount(10)
})
