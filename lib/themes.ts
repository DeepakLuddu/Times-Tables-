// Child-selectable visual worlds. Purely presentational: a theme changes
// colours, names, icons and wording — never questions, mastery, belts
// (tier keys stay white..black), the Piggy Bank, or anything in the database.
// The choice lives in this device's localStorage, same as the player id.

import type { Belt } from "./engine"

export type ThemeId = "ninja" | "space" | "blocks" | "magic" | "animal" | "hero"

export const THEME_STORAGE_KEY = "times-dojo-theme"
export const DEFAULT_THEME: ThemeId = "ninja"

// Tier order matches BELT_ORDER in engine.ts: white → black (black = full mastery).
const TIERS: Belt[] = ["white", "yellow", "green", "blue", "purple", "brown", "black"]

export interface Theme {
  id: ThemeId
  /** Short name shown on the chooser. */
  name: string
  /** One-line pitch shown on the chooser. */
  blurb: string
  /** Emoji used on the chooser card and as the home mascot (non-ninja). */
  emoji: string
  /** Home screen title and tagline. */
  appName: string
  tagline: string
  mascotLabel: string
  /** Rank ladder: a title per tier, a noun ("Belt"/"Rank"...) and a glyph per tier. */
  ranks: Record<Belt, string>
  rankNoun: string
  rankNounPlural: string
  rankEmoji: Record<Belt, string>
  /** Small icon used wherever the ninja world uses 🥋. */
  rankIcon: string
  /** The Belt Wall equivalent. */
  wallName: string
  wallBlurb: string
  wallLoading: string
  journeyTitle: string
  /** How the journey path line is drawn. */
  pathLine: "solid" | "dashed" | "dotted"
  /** The final-test equivalent of the Belt Challenge. */
  challenge: string
  /** Colours for the chooser preview swatch (background, accent). */
  swatch: [string, string]
}

function ladder(names: string[]): Record<Belt, string> {
  return Object.fromEntries(TIERS.map((t, i) => [t, names[i]])) as Record<Belt, string>
}
function glyphs(g: string[]): Record<Belt, string> {
  return Object.fromEntries(TIERS.map((t, i) => [t, g[i]])) as Record<Belt, string>
}

export const THEMES: Record<ThemeId, Theme> = {
  ninja: {
    id: "ninja",
    name: "Ninja Dojo",
    blurb: "Train hard and earn your black belts.",
    emoji: "🥷",
    appName: "Ninja Dojo",
    tagline: "Earn your black belt in the times tables, one fact at a time.",
    mascotLabel: "Ninja Dojo mascot, a red panda in a karate gi",
    ranks: ladder(["White", "Yellow", "Green", "Blue", "Purple", "Brown", "Black"]),
    rankNoun: "Belt",
    rankNounPlural: "Belts",
    rankEmoji: glyphs(["🥋", "🥋", "🥋", "🥋", "🥋", "🥋", "🥋"]),
    rankIcon: "🥋",
    wallName: "Belt Wall",
    wallBlurb: "See your belts and what to work on next.",
    wallLoading: "Loading your belts…",
    journeyTitle: "Your Belt Journey",
    pathLine: "solid",
    challenge: "Belt Challenge",
    swatch: ["#1b2340", "#e8a93b"],
  },
  space: {
    id: "space",
    name: "Space Academy",
    blurb: "Blast off through planets and galaxies.",
    emoji: "🚀",
    appName: "Space Academy",
    tagline: "Blast off to Galaxy Master, one fact at a time.",
    mascotLabel: "Space Academy mascot, an astronaut rocket",
    ranks: ladder(["Cadet", "Explorer", "Pilot", "Navigator", "Commander", "Captain", "Galaxy Master"]),
    rankNoun: "Rank",
    rankNounPlural: "Ranks",
    rankEmoji: glyphs(["🌑", "🛰️", "🚀", "🌙", "🪐", "☄️", "🌟"]),
    rankIcon: "🚀",
    wallName: "Mission Board",
    wallBlurb: "See your ranks and your next mission.",
    wallLoading: "Scanning your ranks…",
    journeyTitle: "Your Mission Journey",
    pathLine: "dashed",
    challenge: "Star Mission",
    swatch: ["#0b1026", "#5ee6ff"],
  },
  blocks: {
    id: "blocks",
    name: "Block Builder",
    blurb: "Build houses, towers and whole cities.",
    emoji: "🧱",
    appName: "Block Builder",
    tagline: "Build your way to City Legend, one fact at a time.",
    mascotLabel: "Block Builder mascot, a friendly builder with bricks",
    ranks: ladder(["Apprentice", "Builder", "Crafter", "Architect", "Designer", "Master Builder", "City Legend"]),
    rankNoun: "Level",
    rankNounPlural: "Levels",
    rankEmoji: glyphs(["🪵", "🧱", "🏠", "🏡", "🏰", "🏙️", "👑"]),
    rankIcon: "🧱",
    wallName: "Build Board",
    wallBlurb: "See what you've built and what to build next.",
    wallLoading: "Loading your builds…",
    journeyTitle: "Your Build Journey",
    pathLine: "solid",
    challenge: "Master Build",
    swatch: ["#1e2b22", "#ffb020"],
  },
  magic: {
    id: "magic",
    name: "Magic Academy",
    blurb: "Learn spells and meet mythical creatures.",
    emoji: "🧙",
    appName: "Magic Academy",
    tagline: "Cast your way to Grand Wizard, one fact at a time.",
    mascotLabel: "Magic Academy mascot, a wizard with a wand",
    ranks: ladder(["Novice", "Apprentice", "Charmer", "Enchanter", "Sorcerer", "Archmage", "Grand Wizard"]),
    rankNoun: "Rank",
    rankNounPlural: "Ranks",
    rankEmoji: glyphs(["🕯️", "📜", "🧪", "🔮", "🪄", "🐉", "✨"]),
    rankIcon: "🔮",
    wallName: "Spellbook",
    wallBlurb: "See your spells and what to learn next.",
    wallLoading: "Opening your spellbook…",
    journeyTitle: "Your Magic Journey",
    pathLine: "dotted",
    challenge: "Wizard Trial",
    swatch: ["#241338", "#ffd36e"],
  },
  animal: {
    id: "animal",
    name: "Animal Adventure",
    blurb: "Explore the jungle and ocean with cute friends.",
    emoji: "🦊",
    appName: "Animal Adventure",
    tagline: "Explore your way to Wild Legend, one fact at a time.",
    mascotLabel: "Animal Adventure mascot, a friendly fox explorer",
    ranks: ladder(["Hatchling", "Cub", "Scout", "Ranger", "Guardian", "Pack Leader", "Wild Legend"]),
    rankNoun: "Badge",
    rankNounPlural: "Badges",
    rankEmoji: glyphs(["🥚", "🐣", "🐾", "🦊", "🦁", "🦉", "🦄"]),
    rankIcon: "🐾",
    wallName: "Badge Book",
    wallBlurb: "See your badges and who to meet next.",
    wallLoading: "Finding your badges…",
    journeyTitle: "Your Adventure Journey",
    pathLine: "dotted",
    challenge: "Legend Quest",
    swatch: ["#12332f", "#ff9f43"],
  },
  hero: {
    id: "hero",
    name: "Hero Academy",
    blurb: "Train your powers and complete missions.",
    emoji: "🦸",
    appName: "Hero Academy",
    tagline: "Power up to Legend, one fact at a time.",
    mascotLabel: "Hero Academy mascot, a caped hero",
    ranks: ladder(["Rookie", "Sidekick", "Defender", "Guardian", "Champion", "Captain", "Legend"]),
    rankNoun: "Rank",
    rankNounPlural: "Ranks",
    rankEmoji: glyphs(["🔰", "⚡", "🛡️", "🦸", "💥", "🏅", "👑"]),
    rankIcon: "⚡",
    wallName: "Hero Hall",
    wallBlurb: "See your ranks and your next mission.",
    wallLoading: "Loading your hero ranks…",
    journeyTitle: "Your Hero Journey",
    pathLine: "solid",
    challenge: "Hero Trial",
    swatch: ["#1f0f16", "#ffcf26"],
  },
}

export const THEME_LIST: Theme[] = [
  THEMES.ninja,
  THEMES.space,
  THEMES.blocks,
  THEMES.magic,
  THEMES.animal,
  THEMES.hero,
]

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && v in THEMES
}

export function rankName(theme: Theme, tier: Belt): string {
  return `${theme.ranks[tier]} ${theme.rankNoun}`
}

// Keep ALL-CAPS strings ALL-CAPS ("BLACK BELT CHALLENGE READY").
function matchCase(src: string, out: string): string {
  return src === src.toUpperCase() ? out.toUpperCase() : out
}

const TIER_PATTERN = "white|yellow|green|blue|purple|brown|black"

// Rewrites belt wording in strings that are built outside React (recent
// wins, mastery labels...) so every world speaks its own language without
// those generators needing to know about themes.
export function localizeText(text: string, theme: Theme): string {
  if (theme.id === "ninja") return text
  return text
    .replace(new RegExp(`\\b(?:(?:${TIER_PATTERN}) )?belt challenge\\b`, "gi"), (m) =>
      matchCase(m, theme.challenge),
    )
    .replace(new RegExp(`\\b(${TIER_PATTERN}) belt\\b`, "gi"), (m, c: string) =>
      matchCase(m, rankName(theme, c.toLowerCase() as Belt)),
    )
    .replace(/\bbelt wall\b/gi, (m) => matchCase(m, theme.wallName))
    .replace(/\bbelts\b/gi, (m) => matchCase(m, theme.rankNounPlural.toLowerCase()))
    .replace(/\bbelt\b/gi, (m) => matchCase(m, theme.rankNoun.toLowerCase()))
    .replace(/🥋/g, theme.rankIcon)
}
