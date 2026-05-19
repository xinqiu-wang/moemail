"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Pencil, Mail, ShieldCheck } from "lucide-react"

interface EmailUpdateDialogProps {
  currentEmail: string
}

export function EmailUpdateDialog({ currentEmail }: EmailUpdateDialogProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'input' | 'verify'>('input')
  const [newEmail, setNewEmail] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const { toast } = useToast()

  const reset = () => {
    setStep('input')
    setNewEmail("")
    setCode("")
    setError("")
  }

  const handleSendCode = async () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError("请输入有效的邮箱地址")
      return
    }
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      })
      const data = await res.json() as { error?: string; message?: string }

      if (!res.ok) {
        setError(data.error || "发送失败")
        setLoading(false)
        return
      }

      setStep('verify')
      toast({ title: "验证码已发送", description: "请查看您的新邮箱" })
    } catch {
      setError("网络错误")
    }
    setLoading(false)
  }

  const handleConfirm = async () => {
    if (!code || code.length !== 6) {
      setError("请输入6位验证码")
      return
    }
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/profile/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, code }),
      })
      const data = await res.json() as { error?: string; message?: string }

      if (!res.ok) {
        setError(data.error || "验证失败")
        setLoading(false)
        return
      }

      toast({ title: "修改成功", description: "邮箱地址已更新" })
      setOpen(false)
      reset()
      // 刷新页面以更新 session
      window.location.reload()
    } catch {
      setError("网络错误")
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <button className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
          <Pencil className="w-3 h-3" />
          {currentEmail ? "修改邮箱" : "绑定邮箱"}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentEmail ? "修改邮箱" : "绑定邮箱"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {step === 'input' ? (
            <>
              <div className="space-y-1.5">
                <div className="relative">
                  <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                    <Mail className="h-5 w-5" />
                  </div>
                  <Input
                    className="h-10 pl-9"
                    type="email"
                    placeholder="输入新邮箱地址"
                    value={newEmail}
                    onChange={(e) => { setNewEmail(e.target.value); setError("") }}
                    disabled={loading}
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <Button
                className="w-full"
                onClick={handleSendCode}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                发送验证码
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                验证码已发送至 <span className="font-medium text-foreground">{newEmail}</span>
              </p>
              <div className="space-y-1.5">
                <div className="relative">
                  <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <Input
                    className="h-10 pl-9 text-center tracking-[8px] font-mono text-lg"
                    placeholder="输入6位验证码"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError("") }}
                    maxLength={6}
                    disabled={loading}
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('input')}
                  disabled={loading}
                >
                  返回
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  确认修改
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
