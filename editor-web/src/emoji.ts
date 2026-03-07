export type EmojiOption = {
  emoji: string
  aliases: string[]
  description: string
}

const emojiCatalog: EmojiOption[] = [
  { emoji: '😀', aliases: ['grinning'], description: 'Grinning face' },
  { emoji: '😄', aliases: ['smile', 'smiley'], description: 'Smiling face' },
  { emoji: '😊', aliases: ['blush'], description: 'Smiling face with smiling eyes' },
  { emoji: '😉', aliases: ['wink'], description: 'Winking face' },
  { emoji: '😍', aliases: ['heart_eyes'], description: 'Smiling face with heart eyes' },
  { emoji: '🤔', aliases: ['thinking'], description: 'Thinking face' },
  { emoji: '🔥', aliases: ['fire'], description: 'Fire' },
  { emoji: '✨', aliases: ['sparkles'], description: 'Sparkles' },
  { emoji: '🎉', aliases: ['tada', 'party_popper'], description: 'Party popper' },
  { emoji: '🚀', aliases: ['rocket'], description: 'Rocket' },
  { emoji: '✅', aliases: ['white_check_mark', 'check'], description: 'Check mark button' },
  { emoji: '💡', aliases: ['bulb', 'idea'], description: 'Light bulb' },
  { emoji: '📝', aliases: ['memo', 'note'], description: 'Memo' },
  { emoji: '🔗', aliases: ['link'], description: 'Link' },
  { emoji: '📎', aliases: ['paperclip'], description: 'Paperclip' },
  { emoji: '👀', aliases: ['eyes'], description: 'Eyes' },
  { emoji: '👍', aliases: ['thumbsup', '+1'], description: 'Thumbs up' },
  { emoji: '❤️', aliases: ['heart'], description: 'Red heart' }
]

type RankedEmojiOption = {
  option: EmojiOption
  rank: number
  alias: string
}

const rankEmojiOption = (option: EmojiOption, query: string): RankedEmojiOption | null => {
  const normalizedQuery = query.trim().toLowerCase()
  const primaryAlias = option.aliases[0] ?? ''

  if (normalizedQuery.length === 0) {
    return {
      option,
      rank: 10,
      alias: primaryAlias
    }
  }

  const description = option.description.toLowerCase()
  let bestRank = Number.POSITIVE_INFINITY

  for (const alias of option.aliases) {
    const normalizedAlias = alias.toLowerCase()

    if (normalizedAlias === normalizedQuery) {
      bestRank = Math.min(bestRank, 0)
      continue
    }

    if (normalizedAlias.startsWith(normalizedQuery)) {
      bestRank = Math.min(bestRank, 1)
      continue
    }

    if (normalizedAlias.includes(normalizedQuery)) {
      bestRank = Math.min(bestRank, 2)
    }
  }

  if (description.includes(normalizedQuery)) {
    bestRank = Math.min(bestRank, 3)
  }

  if (!Number.isFinite(bestRank)) {
    return null
  }

  return {
    option,
    rank: bestRank,
    alias: primaryAlias
  }
}

export const searchEmojiOptions = (query: string, limit = 8) => {
  return emojiCatalog
    .map((option) => rankEmojiOption(option, query))
    .filter((option): option is RankedEmojiOption => option !== null)
    .sort((left, right) => left.rank - right.rank || left.alias.localeCompare(right.alias))
    .slice(0, limit)
    .map(({ option }) => option)
}
