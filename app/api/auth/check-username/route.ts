import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const runtime = "edge"

export async function POST(request: Request) {
  try {
    const { username } = await request.json() as { username: string }

    if (!username || username.length < 1) {
      return NextResponse.json({ available: false })
    }

    const db = createDb()
    const existing = await db.query.users.findFirst({
      where: eq(users.username, username),
    })

    return NextResponse.json({ available: !existing })
  } catch {
    return NextResponse.json({ available: false })
  }
}
