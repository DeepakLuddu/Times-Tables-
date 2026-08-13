"use client"

import {
  type ParentPiggyBankData,
  getParentPiggyBankData,
  hasParentPin,
  setParentPin,
  withdrawFromPiggyBank,
} from "@/app/actions/piggybank"
import { formatCents, formatMinSec } from "@/lib/piggybank"
import { Lock, PiggyBank as PiggyBankIcon } from "lucide-react"
import { useEffect, useState } from "react"

type Stage = "loading" | "setup" | "locked" | "unlocked"

function formatWithdrawalDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function PiggyBankParent({ playerId }: { playerId: string }) {
  const [stage, setStage] = useState<Stage>("loading")
  const [pinInput, setPinInput] = useState("")
  const [confirmPinInput, setConfirmPinInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [unlockedPin, setUnlockedPin] = useState("")
  const [data, setData] = useState<ParentPiggyBankData | null>(null)

  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawBusy, setWithdrawBusy] = useState(false)

  useEffect(() => {
    if (!playerId) return
    void hasParentPin(playerId).then((has) =>
      setStage(has ? "locked" : "setup"),
    )
  }, [playerId])

  async function submitSetupPin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pinInput !== confirmPinInput) {
      setError("PINs don't match.")
      return
    }
    const res = await setParentPin(playerId, pinInput)
    if (!res.ok) {
      setError(res.error ?? "Couldn't set that PIN.")
      return
    }
    await unlock(pinInput)
  }

  async function submitUnlockPin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    await unlock(pinInput)
  }

  async function unlock(pin: string) {
    const res = await getParentPiggyBankData(playerId, pin)
    if (!res.ok || !res.data) {
      setError(res.error ?? "Incorrect PIN.")
      return
    }
    setData(res.data)
    setUnlockedPin(pin)
    setStage("unlocked")
    setPinInput("")
    setConfirmPinInput("")
  }

  function lock() {
    setStage("locked")
    setData(null)
    setUnlockedPin("")
    setPinInput("")
    setWithdrawAmount("")
    setConfirmingWithdraw(false)
    setWithdrawError(null)
  }

  async function confirmWithdraw() {
    if (!data) return
    const amountCents = Math.round(Number.parseFloat(withdrawAmount) * 100)
    setWithdrawError(null)
    setWithdrawBusy(true)
    const res = await withdrawFromPiggyBank({
      playerId,
      pin: unlockedPin,
      amountCents,
    })
    setWithdrawBusy(false)
    if (!res.ok || !res.summary) {
      setWithdrawError(res.error ?? "Couldn't record that withdrawal.")
      return
    }
    setData({ ...data, summary: res.summary })
    setWithdrawAmount("")
    setConfirmingWithdraw(false)
  }

  if (stage === "loading") return null

  return (
    <section className="mt-6 rounded-2xl bg-card px-5 py-4 text-card-foreground shadow-md">
      <div className="flex items-center gap-2">
        <PiggyBankIcon className="size-5 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Piggy Bank</h2>
        {stage === "unlocked" && (
          <button
            type="button"
            onClick={lock}
            className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 font-sans text-xs text-card-foreground/50 transition-colors hover:bg-muted hover:text-card-foreground"
          >
            <Lock className="size-3" /> Lock
          </button>
        )}
      </div>

      {stage === "setup" && (
        <form onSubmit={submitSetupPin} className="mt-3 flex flex-col gap-3">
          <p className="font-sans text-sm text-card-foreground/70">
            Set a 4 to 6 digit PIN to protect the Piggy Bank balance and
            withdrawals. Your child won&apos;t see this area.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="New PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            className="rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-lg tracking-widest text-foreground outline-none focus:border-primary"
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Confirm PIN"
            value={confirmPinInput}
            onChange={(e) =>
              setConfirmPinInput(e.target.value.replace(/\D/g, ""))
            }
            className="rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-lg tracking-widest text-foreground outline-none focus:border-primary"
          />
          {error && (
            <p className="font-sans text-sm text-destructive">{error}</p>
          )}
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2.5 font-display font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            Set PIN
          </button>
        </form>
      )}

      {stage === "locked" && (
        <form onSubmit={submitUnlockPin} className="mt-3 flex flex-col gap-3">
          <p className="font-sans text-sm text-card-foreground/70">
            Enter your PIN to view the balance and withdrawal history.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            className="rounded-xl border border-border bg-background px-4 py-2.5 font-mono text-lg tracking-widest text-foreground outline-none focus:border-primary"
          />
          {error && (
            <p className="font-sans text-sm text-destructive">{error}</p>
          )}
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2.5 font-display font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            Unlock
          </button>
        </form>
      )}

      {stage === "unlocked" && data && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <p className="font-sans text-xs text-card-foreground/60">
              Current balance
            </p>
            <p className="font-mono text-4xl font-bold tabular-nums">
              {formatCents(data.summary.balanceCents)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat
              label="This week's earnings"
              value={`${formatCents(data.summary.earnedThisWeekCents)} / ${formatCents(data.summary.weeklyCapCents)}`}
            />
            <MiniStat
              label="Correct this week"
              value={data.summary.correctThisWeek.toString()}
            />
            <MiniStat
              label="Practice this week"
              value={formatMinSec(data.practiceSecondsThisWeek)}
            />
            <MiniStat
              label="Total correct"
              value={data.summary.totalCorrect.toString()}
            />
            <MiniStat
              label="Current streak"
              value={data.summary.currentStreak.toString()}
            />
            <MiniStat
              label="Best streak"
              value={data.summary.bestStreak.toString()}
            />
          </div>

          {/* Withdraw */}
          <div className="rounded-xl border border-border px-4 py-3">
            <p className="font-display text-sm font-semibold">
              Mark as paid / Withdraw
            </p>
            <p className="mt-0.5 font-sans text-xs text-card-foreground/60">
              Record that you&apos;ve paid your child outside the app. No
              real money moves here.
            </p>
            {!confirmingWithdraw ? (
              <div className="mt-3 flex gap-2">
                <div className="flex flex-1 items-center rounded-xl border border-border bg-background px-3">
                  <span className="font-mono text-card-foreground/50">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full bg-transparent px-2 py-2.5 font-mono text-base text-foreground outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={
                    !withdrawAmount || Number.parseFloat(withdrawAmount) <= 0
                  }
                  onClick={() => {
                    setWithdrawError(null)
                    setConfirmingWithdraw(true)
                  }}
                  className="rounded-xl bg-primary px-4 py-2.5 font-display font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                >
                  Withdraw
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted px-4 py-3">
                <p className="font-sans text-sm text-foreground">
                  Withdraw{" "}
                  <span className="font-mono font-semibold">
                    {formatCents(
                      Math.round(Number.parseFloat(withdrawAmount) * 100),
                    )}
                  </span>{" "}
                  from{" "}
                  <span className="font-mono font-semibold">
                    {formatCents(data.summary.balanceCents)}
                  </span>
                  ?
                </p>
                {withdrawError && (
                  <p className="font-sans text-sm text-destructive">
                    {withdrawError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={withdrawBusy}
                    onClick={confirmWithdraw}
                    className="rounded-xl bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                  >
                    {withdrawBusy ? "Recording…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingWithdraw(false)}
                    className="rounded-xl border border-border px-4 py-2 font-display text-sm text-foreground transition-colors hover:bg-background"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History */}
          <div>
            <p className="font-display text-sm font-semibold">
              Withdrawal history
            </p>
            {data.summary.withdrawals.length === 0 ? (
              <p className="mt-2 font-sans text-sm text-card-foreground/60">
                No withdrawals recorded yet.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col divide-y divide-border/50">
                {[...data.summary.withdrawals]
                  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                  .map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between py-2 font-sans text-sm"
                    >
                      <span className="text-card-foreground/70">
                        {formatWithdrawalDate(w.createdAt.toISOString())}
                      </span>
                      <span className="font-mono">
                        -{formatCents(w.amountCents)}
                      </span>
                      <span className="font-mono text-xs text-card-foreground/50">
                        {formatCents(w.balanceBeforeCents)} →{" "}
                        {formatCents(w.balanceAfterCents)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-muted/50 px-3 py-2">
      <span className="font-mono text-base font-bold tabular-nums">
        {value}
      </span>
      <span className="font-sans text-[11px] text-card-foreground/60">
        {label}
      </span>
    </div>
  )
}
