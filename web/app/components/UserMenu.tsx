"use client";

import { signOut } from "next-auth/react";

export default function UserMenu({ email }: { email?: string | null }) {
  return (
    <div className="mb-5 rounded-lg bg-gray-800 p-3 text-sm">
      <p className="truncate text-gray-300">{email}</p>
      <button onClick={() => void signOut({ redirectTo: "/login" })} className="mt-2 text-red-300">Đăng xuất</button>
    </div>
  );
}
