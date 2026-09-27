/** Titles may change; a decade's year remains its page and comment identity. */
export function parseDecadeHeading(title) {
  const match = String(title)
    .trim()
    .match(/^([1-9]\d{2}0)년대(?=$|[\s:：—–-])\s*(?:[—–:：-]\s*)?(.*)$/u)
  if (!match) return null
  return { year: match[1], label: `${match[1]}년대`, subtitle: match[2].trim() }
}
