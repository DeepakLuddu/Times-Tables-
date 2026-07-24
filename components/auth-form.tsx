"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Star } from "lucide-react"

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === "sign-up"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({ email, password, name })
        if (error) throw new Error(error.message || "Could not create account")
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.message || "Could not sign in")
      }
      router.push("/")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md rounded-3xl border-4 border-primary/20 bg-card p-8 shadow-xl">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Star className="h-9 w-9" fill="currentColor" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-balance">
          {isSignUp ? "Create your player" : "Welcome back, superstar!"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {isSignUp ? "Let's start your times tables adventure." : "Ready to earn more stars today?"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isSignUp && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-semibold">
              Your name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="e.g. Mia"
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
            placeholder="grownup@email.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} size="lg" className="mt-2 rounded-xl text-base font-bold">
          {loading ? "One moment..." : isSignUp ? "Start playing" : "Let's go!"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have a player? " : "New here? "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-bold text-primary underline-offset-2 hover:underline">
          {isSignUp ? "Sign in" : "Create a player"}
        </Link>
      </p>
    </div>
  )
}
