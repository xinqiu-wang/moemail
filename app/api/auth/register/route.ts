import { NextResponse } from "next/server"
import { register } from "@/lib/auth"

export const runtime = "edge"

export async function POST(request: Request) {
  try {
    const { username, password, email } = await request.json() as {
      username: string
      password: string
      email?: string
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: "用户名和密码不能为空" },
        { status: 400 }
      )
    }

    if (username.length > 20) {
      return NextResponse.json(
        { error: "用户名不能超过20个字符" },
        { status: 400 }
      )
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json(
        { error: "用户名只能包含字母、数字、下划线和横杠" },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "密码长度必须大于等于8位" },
        { status: 400 }
      )
    }

    const user = await register(username, password, email)

    return NextResponse.json({ user })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "注册失败" },
      { status: 500 }
    )
  }
}
