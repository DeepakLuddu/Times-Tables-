import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/")

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <AuthForm mode="sign-in" />
    </main>
  )
}
