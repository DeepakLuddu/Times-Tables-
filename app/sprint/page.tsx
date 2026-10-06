import { redirect } from "next/navigation"

// Sprint mode was retired — keep old bookmarks working.
export default function SprintPage() {
  redirect("/practice")
}
