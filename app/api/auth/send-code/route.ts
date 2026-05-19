import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { createDb } from "@/lib/db"
import { verificationCodes, users } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const runtime = "edge"

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: Request) {
  try {
    const { email, type = 'register' } = await request.json() as { email: string; type?: string }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 })
    }

    // 注册时检查邮箱是否已被使用
    if (type === 'register' || type === 'update-email') {
      const db = createDb()
      const existing = await db.query.users.findFirst({
        where: eq(users.email, email)
      })
      if (existing && type === 'register') {
        return NextResponse.json({ error: "该邮箱已被注册" }, { status: 409 })
      }
    }

    const env = getRequestContext().env
    const apiKey = await env.SITE_CONFIG.get("RESEND_API_KEY")

    if (!apiKey) {
      return NextResponse.json(
        { error: "邮件服务未配置，请联系管理员" },
        { status: 500 }
      )
    }

    const emailDomains = await env.SITE_CONFIG.get("EMAIL_DOMAINS") || "moemail.app"
    const fromDomain = emailDomains.split(',')[0].trim()

    const code = generateCode()
    const db = createDb()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10分钟有效

    // 存储验证码
    await db.insert(verificationCodes).values({
      email,
      code,
      type,
      expiresAt,
    })

    // 发送邮件
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `MoeMail <noreply@${fromDomain}>`,
        to: [email],
        subject: type === 'register' ? '欢迎注册 MoeMail - 验证码' : 'MoeMail - 邮箱验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #6d28d9; font-size: 24px; margin: 0;">MoeMail</h1>
              <p style="color: #6b7280; margin-top: 8px;">萌萌哒临时邮箱服务</p>
            </div>
            <div style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <h2 style="font-size: 16px; color: #374151; margin: 0 0 16px;">
                ${type === 'register' ? '欢迎注册 MoeMail！' : '验证您的邮箱'}
              </h2>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                ${type === 'register' ? '请使用以下验证码完成注册：' : '请使用以下验证码验证您的邮箱：'}
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6d28d9; background: #f3e8ff; padding: 12px 24px; border-radius: 8px;">
                  ${code}
                </span>
              </div>
              <p style="color: #9ca3af; font-size: 12px;">
                验证码有效期为 10 分钟，请尽快完成验证。
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
                如果您没有请求此验证码，请忽略此邮件。
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json() as { message?: string }
      const errorMsg = errorData?.message || ''
      console.error('Resend API error:', errorData)
      let userMsg = "验证码发送失败，请稍后重试"
      if (errorMsg.includes('not verified') || errorMsg.includes('domain')) {
        userMsg = "发件域名未验证，请在 Resend 后台添加并验证域名 " + fromDomain
      } else if (errorMsg.includes('rate')) {
        userMsg = "发送太频繁，请稍后再试"
      }
      return NextResponse.json({ error: userMsg }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "验证码已发送到您的邮箱" })
  } catch (error) {
    console.error('Failed to send code:', error)
    return NextResponse.json(
      { error: "验证码发送失败，请稍后重试" },
      { status: 500 }
    )
  }
}
