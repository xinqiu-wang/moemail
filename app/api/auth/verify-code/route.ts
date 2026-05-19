import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { verificationCodes } from "@/lib/schema"
import { and, eq, gt, sql } from "drizzle-orm"

export const runtime = "edge"

export async function POST(request: Request) {
  try {
    const { email, code, type = 'register' } = await request.json() as {
      email: string
      code: string
      type?: string
    }

    if (!email || !code) {
      return NextResponse.json({ error: "邮箱和验证码不能为空" }, { status: 400 })
    }

    const db = createDb()
    const now = new Date()

    // 查找未使用且在有效期内的验证码
    const records = await db.query.verificationCodes.findMany({
      where: and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, code),
        eq(verificationCodes.type, type),
        eq(verificationCodes.used, false),
        gt(verificationCodes.expiresAt, now),
      ),
      orderBy: sql`created_at DESC`,
      limit: 1,
    })

    if (records.length === 0) {
      return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 })
    }

    // 标记为已使用
    await db.update(verificationCodes)
      .set({ used: true })
      .where(eq(verificationCodes.id, records[0].id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to verify code:', error)
    return NextResponse.json(
      { error: "验证失败，请稍后重试" },
      { status: 500 }
    )
  }
}
