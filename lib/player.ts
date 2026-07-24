// Anonymous identity — no login, no email. A random player id is generated
// once per browser and kept in localStorage; a fresh session id is minted
// for each Practice or Sprint sitting.

const PLAYER_KEY = "times-dojo-player-id"

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function getPlayerId(): string {
  if (typeof window === "undefined") return ""
  let id = window.localStorage.getItem(PLAYER_KEY)
  if (!id) {
    id = randomId()
    window.localStorage.setItem(PLAYER_KEY, id)
  }
  return id
}

export function newSessionId(): string {
  return randomId()
}
