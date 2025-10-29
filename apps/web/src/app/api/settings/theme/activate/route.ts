// src/app/api/settings/theme/active/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ theme: 'light' }, { status: 200 })

  const setting = await prisma.userSetting.findUnique({
    where: { userId: me.id },
    select: { activeTheme: true },
  })
  return NextResponse.json({ theme: setting?.activeTheme ?? 'light' })
}
