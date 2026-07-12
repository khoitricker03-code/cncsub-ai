import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const email = body && typeof body === "object" && "email" in body
    ? String(body.email).trim().toLowerCase() : "";
  const password = body && typeof body === "object" && "password" in body
    ? String(body.password) : "";
  const name = body && typeof body === "object" && "name" in body
    ? String(body.name).trim().slice(0, 120) : "";

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return NextResponse.json(
      { success: false, error: "Email không hợp lệ hoặc mật khẩu dưới 8 ký tự." },
      { status: 400 },
    );
  }

  try {
    await prisma.user.create({
      data: { email, name: name || null, passwordHash: await bcrypt.hash(password, 12) },
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Email đã được sử dụng." },
      { status: 409 },
    );
  }
}
