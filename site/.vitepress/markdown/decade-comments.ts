import type { MarkdownOptions } from 'vitepress'

type Markdown = Parameters<NonNullable<MarkdownOptions['config']>>[0]

/** Link full-story readers to each decade's shared comment thread. */
export function decadeComments(md: Markdown, options: { base: string; enabled: boolean }) {
  if (!options.enabled) return

  md.core.ruler.after('inline', 'decade_comments', (state) => {
    if (state.env.frontmatter?.kind !== 'full') return

    const tokens: typeof state.tokens = []
    const linked = new Set<string>()
    let decade: string | undefined

    const appendLink = () => {
      if (!decade || linked.has(decade)) return
      const link = new state.Token('decade_comments', '', 0)
      link.block = true
      link.meta = { decade }
      tokens.push(link)
      linked.add(decade)
    }

    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]
      if (token.type === 'heading_open' && token.tag === 'h2' && token.level === 0) {
        // Close the preceding decade before any new H2, including the final afterword.
        appendLink()
        const heading = state.tokens[index + 1]
        decade =
          heading?.type === 'inline'
            ? heading.content.match(/^(19[3-9]0|20[0-2]0)년대(?:\s|$)/)?.[1]
            : undefined
      }
      tokens.push(token)
    }
    appendLink()
    state.tokens = tokens
  })

  md.renderer.rules.decade_comments = (tokens, index) => {
    const decade = tokens[index].meta.decade as string
    const base = options.base.endsWith('/') ? options.base : `${options.base}/`
    const href = md.utils.escapeHtml(`${base}read/${decade}s.html#comments`)
    return `<p class="decade-comments-link"><a href="${href}">${decade}년대 기억 보태기</a></p>\n`
  }
}
