import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { createDb } from "@/lib/db"
import { verificationCodes, users } from "@/lib/schema"
import { auth, comparePassword, hashPassword } from "@/lib/auth"
import { eq, and, gt, sql } from "drizzle-orm"

export const runtime = "edge"

// 获取当前用户邮箱
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const db = createDb()
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true, emailVerified: true },
  })

  return NextResponse.json({ email: user?.email || null, emailVerified: user?.emailVerified || null })
}

// 发送修改邮箱验证码
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { newEmail } = await request.json() as { newEmail: string }

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 })
  }

  const db = createDb()
  const existing = await db.query.users.findFirst({
    where: eq(users.email, newEmail),
  })
  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 })
  }

  const env = getRequestContext().env
  const apiKey = await env.SITE_CONFIG.get("RESEND_API_KEY")
  if (!apiKey) {
    return NextResponse.json({ error: "邮件服务未配置" }, { status: 500 })
  }

  const emailDomains = await env.SITE_CONFIG.get("EMAIL_DOMAINS") || "moemail.app"
  const fromDomain = emailDomains.split(',')[0].trim()

  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await db.insert(verificationCodes).values({
    email: newEmail,
    code,
    type: 'update-email',
    expiresAt,
  })

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `MoeMail <noreply@${fromDomain}>`,
      to: [newEmail],
      subject: 'MoeMail - 邮箱修改验证码',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #6d28d9; font-size: 24px; margin: 0;">MoeMail</h1>
            <p style="color: #6b7280; margin-top: 8px;">萌萌哒临时邮箱服务</p>
          </div>
          <div style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="font-size: 16px; color: #374151; margin: 0 0 16px;">修改邮箱地址</h2>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              请使用以下验证码验证您的新邮箱：
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6d28d9; background: #f3e8ff; padding: 12px 24px; border-radius: 8px;">
                ${code}
              </span>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">验证码有效期为 10 分钟。</p>
          </div>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    return NextResponse.json({ error: "验证码发送失败" }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: "验证码已发送" })
}

// 确认修改邮箱
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { newEmail, code } = await request.json() as { newEmail: string; code: string }

  if (!newEmail || !code) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 })
  }

  const db = createDb()
  const now = new Date()

  const records = await db.query.verificationCodes.findMany({
    where: and(
      eq(verificationCodes.email, newEmail),
      eq(verificationCodes.code, code),
      eq(verificationCodes.type, 'update-email'),
      eq(verificationCodes.used, false),
      gt(verificationCodes.expiresAt, now),
    ),
    orderBy: sql`created_at DESC`,
    limit: 1,
  })

  if (records.length === 0) {
    return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 })
  }

  await db.update(verificationCodes)
    .set({ used: true })
    .where(eq(verificationCodes.id, records[0].id))

  await db.update(users)
    .set({ email: newEmail, emailVerified: now })
    .where(eq(users.id, session.user.id))

  return NextResponse.json({ success: true, message: "邮箱修改成功" })
}
