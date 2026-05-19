"use client"

import { useCallback, useState, useEffect, useRef } from "react"
import { signIn } from "next-auth/react"
// import { useTranslations } from "next-intl"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Github, Loader2, KeyRound, User2, Mail, ShieldCheck, Check, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Turnstile } from "@/components/auth/turnstile"

interface TurnstileConfigProps {
  enabled: boolean
  siteKey: string
}

interface LoginFormProps {
  turnstile?: TurnstileConfigProps
}

export function LoginForm({ turnstile }: LoginFormProps) {
  const [tab, setTab] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle")
  const [turnstileToken, setTurnstileToken] = useState("")
  const [turnstileResetCounter, setTurnstileResetCounter] = useState(0)
  const { toast } = useToast()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const turnstileSiteKey = turnstile?.siteKey ?? ""
  const turnstileEnabled = !!(turnstile?.enabled && turnstileSiteKey)

  // 倒计时
  useEffect(() => {
    if (codeCountdown > 0) {
      const timer = setTimeout(() => setCodeCountdown(c => c - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [codeCountdown])

  const resetTurnstile = useCallback(() => {
    setTurnstileToken("")
    setTurnstileResetCounter(p => p + 1)
  }, [])

  // 用户名实时验证（防抖 1s）
  useEffect(() => {
    if (tab !== "register" || !username || username.includes('@') || username.length < 2) {
      setUsernameStatus("idle")
      return
    }
    setUsernameStatus("checking")
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        })
        const data = await res.json() as { available: boolean }
        setUsernameStatus(data.available ? "available" : "taken")
      } catch {
        setUsernameStatus("idle")
      }
    }, 1000)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [username, tab])

  const clearForm = () => {
    setUsername(""); setPassword(""); setConfirmPassword("")
    setEmail(""); setCode(""); setCodeSent(false); setErrors({}); setUsernameStatus("idle")
  }

  const validateAll = (checkCode = true) => {
    const errs: Record<string, string> = {}
    if (tab === "login") {
      if (!username) errs.username = "请输入用户名"
      if (!password) errs.password = "请输入密码"
    } else {
      if (!username) errs.username = "请输入用户名"
      else if (username.includes('@')) errs.username = "用户名不能包含@"
      else if (username.length > 20) errs.username = "用户名不能超过20个字符"
      if (!email) errs.email = "请输入邮箱"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "邮箱格式不正确"
      if (!password) errs.password = "请输入密码"
      else if (password.length < 8) errs.password = "密码至少8位"
      if (password !== confirmPassword) errs.confirmPassword = "两次密码不一致"
      if (checkCode && codeSent && !code) errs.code = "请输入验证码"
      else if (checkCode && codeSent && code.length !== 6) errs.code = "验证码为6位数字"
      if (usernameStatus === "taken") errs.username = "该用户名已被注册"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleLogin = async () => {
    if (!validateAll()) return
    if (turnstileEnabled && !turnstileToken) {
      toast({ title: "请完成安全验证", variant: "destructive" }); return
    }
    setLoading(true)
    const result = await signIn("credentials", { username, password, turnstileToken, redirect: false })
    if (result?.error) {
      toast({ title: "登录失败", description: result.error, variant: "destructive" })
      setLoading(false); resetTurnstile(); return
    }
    window.location.href = "/"
  }

  const handleSendCode = async () => {
    const errs: Record<string, string> = {}
    if (!email) errs.email = "请输入邮箱"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "邮箱格式不正确"
    if (!username) errs.username = "请输入用户名"
    if (!password) errs.password = "请输入密码"
    else if (password.length < 8) errs.password = "密码至少8位"
    if (password !== confirmPassword) errs.confirmPassword = "两次密码不一致"
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSendingCode(true)
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "register" }),
      })
      const data = await res.json() as { error?: string; message?: string }
      if (!res.ok) {
        toast({ title: "发送失败", description: data.error, variant: "destructive" })
        setSendingCode(false); return
      }
      setCodeSent(true)
      setCodeCountdown(60)
      toast({ title: "验证码已发送", description: "请查看您的邮箱" })
    } catch {
      toast({ title: "发送失败", description: "网络错误", variant: "destructive" })
    }
    setSendingCode(false)
  }

  const handleRegister = async () => {
    if (!validateAll(true)) return
    if (turnstileEnabled && !turnstileToken) {
      toast({ title: "请完成安全验证", variant: "destructive" }); return
    }
    setLoading(true)
    try {
      const vr = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, type: "register" }),
      })
      if (!vr.ok) {
        const vd = await vr.json() as { error?: string }
        toast({ title: "验证失败", description: vd.error || "验证码错误", variant: "destructive" })
        setLoading(false); resetTurnstile(); return
      }
      const rr = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email }),
      })
      if (!rr.ok) {
        const rd = await rr.json() as { error?: string }
        toast({ title: "注册失败", description: rd.error, variant: "destructive" })
        setLoading(false); resetTurnstile(); return
      }
      const si = await signIn("credentials", { username, password, turnstileToken, redirect: false })
      if (si?.error) {
        toast({ title: "自动登录失败", description: si.error, variant: "destructive" })
        setLoading(false); resetTurnstile(); return
      }
      window.location.href = "/"
    } catch {
      toast({ title: "注册失败", description: "网络错误", variant: "destructive" })
      setLoading(false); resetTurnstile()
    }
  }

  const InputField = ({ icon: Icon, label, type, value, onChange, error, disabled, suffix }: {
    icon: any; label: string; type?: string; value: string; onChange: (v: string) => void;
    error?: string; disabled?: boolean; suffix?: React.ReactNode
  }) => (
    <div className="space-y-1">
      <div className={cn(
        "relative flex items-center rounded-lg border bg-background/50 transition-all duration-200",
        "focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary",
        error ? "border-red-300 focus-within:ring-red-200 focus-within:border-red-400" : "border-input"
      )}>
        <div className="pl-3 text-muted-foreground shrink-0"><Icon className="h-4 w-4" /></div>
        <Input
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-10 px-2"
          placeholder={label}
          type={type || "text"}
          value={value}
          onChange={e => { onChange(e.target.value); setErrors({}) }}
          disabled={disabled}
        />
        {suffix && <div className="pr-3">{suffix}</div>}
      </div>
      {error && <p className="text-xs text-red-500 flex items-center gap-1 px-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  )

  return (
    <div className="w-[95%] max-w-md">
      {/* 标签切换 */}
      <div className="flex mb-6 bg-muted/60 rounded-xl p-1">
        {(["login", "register"] as const).map(key => (
          <button
            key={key}
            onClick={() => { setTab(key); clearForm() }}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
              tab === key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {key === "login" ? "登录" : "注册"}
          </button>
        ))}
      </div>

      <div className="bg-background/80 backdrop-blur-sm rounded-2xl border p-6 shadow-lg space-y-5">
        {/* 登录 */}
        {tab === "login" && (
          <>
            <div className="text-center space-y-1 mb-2">
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent">
                欢迎回来
              </h2>
              <p className="text-sm text-muted-foreground">登录您的 MoeMail 账号</p>
            </div>
            <div className="space-y-3">
              <InputField icon={User2} label="用户名" value={username} onChange={setUsername} error={errors.username} disabled={loading} />
              <InputField icon={KeyRound} label="密码" type={showPassword ? "text" : "password"} value={password} onChange={setPassword} error={errors.password} disabled={loading}
                suffix={
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground text-xs">
                    {showPassword ? "隐藏" : "显示"}
                  </button>
                }
              />
            </div>
            <Button className="w-full h-10 rounded-xl font-medium" onClick={handleLogin} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              登录
            </Button>
            <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">或</span></div></div>
            <Button variant="outline" className="w-full h-10 rounded-xl" onClick={() => signIn("github", { callbackUrl: "/" })}>
              <Github className="mr-2 h-4 w-4" /> 使用 GitHub 登录
            </Button>
          </>
        )}

        {/* 注册 */}
        {tab === "register" && (
          <>
            <div className="text-center space-y-1 mb-2">
              <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent">
                创建账号
              </h2>
              <p className="text-sm text-muted-foreground">注册即可使用临时邮箱服务</p>
            </div>
            <div className="space-y-3">
              {/* 用户名 */}
              <InputField icon={User2} label="用户名" value={username} onChange={setUsername} error={errors.username} disabled={loading || sendingCode}
                suffix={
                  usernameStatus === "checking" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
                  usernameStatus === "available" ? <Check className="h-4 w-4 text-green-500" /> :
                  usernameStatus === "taken" ? <X className="h-4 w-4 text-red-500" /> : null
                }
              />

              {/* 邮箱 */}
              <InputField icon={Mail} label="邮箱地址" type="email" value={email} onChange={setEmail} error={errors.email} disabled={loading || sendingCode || codeSent} />

              {/* 密码 */}
              <InputField icon={KeyRound} label="密码" type={showPassword ? "text" : "password"} value={password} onChange={setPassword} error={errors.password} disabled={loading || sendingCode}
                suffix={
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground text-xs">
                    {showPassword ? "隐藏" : "显示"}
                  </button>
                }
              />

              {/* 确认密码 */}
              <InputField icon={KeyRound} label="确认密码" type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} disabled={loading || sendingCode}
                suffix={
                  confirmPassword ? (
                    password === confirmPassword
                      ? <Check className="h-4 w-4 text-green-500" />
                      : <X className="h-4 w-4 text-red-500" />
                  ) : <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="text-muted-foreground hover:text-foreground text-xs">
                      {showConfirm ? "隐藏" : "显示"}
                    </button>
                }
              />

              {/* 验证码 */}
              {codeSent && (
                <InputField icon={ShieldCheck} label="输入6位验证码" value={code} onChange={v => setCode(v.replace(/\D/g, '').slice(0, 6))} error={errors.code} disabled={loading}
                  suffix={
                    <span className="text-xs text-muted-foreground font-mono">{code.length}/6</span>
                  }
                />
              )}
            </div>

            <div className="space-y-2 pt-1">
              {!codeSent ? (
                <Button className="w-full h-10 rounded-xl font-medium" onClick={handleSendCode} disabled={loading || sendingCode || usernameStatus === "taken"}>
                  {sendingCode ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {sendingCode ? "发送中..." : "发送验证码"}
                </Button>
              ) : (
                <>
                  <Button className="w-full h-10 rounded-xl font-medium" onClick={handleRegister} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    注册并登录
                  </Button>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>未收到？</span>
                    <button
                      onClick={handleSendCode}
                      disabled={codeCountdown > 0 || sendingCode}
                      className={cn("text-primary hover:underline", codeCountdown > 0 && "opacity-50 cursor-not-allowed")}
                    >
                      {codeCountdown > 0 ? `${codeCountdown}s 后重新发送` : "重新发送"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Turnstile */}
        {turnstileEnabled && turnstileSiteKey && (
          <div className="flex justify-center">
            <Turnstile siteKey={turnstileSiteKey} onVerify={setTurnstileToken} onExpire={resetTurnstile} resetSignal={turnstileResetCounter} />
          </div>
        )}
      </div>
    </div>
  )
}
