"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (formData: FormData) => {
    setLoading(true);
    setError("");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    if (mode === "register") {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: formData.get("name") }),
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok) {
        setError(result.error ?? "Không thể đăng ký.");
        setLoading(false);
        return;
      }
    }

    const result = await signIn("credentials", { email, password, redirect: false });

    if (result?.error) {
      setError("Email hoặc mật khẩu không đúng.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8">
      <h1 className="mb-6 text-3xl font-bold">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
      <form action={(data) => void submit(data)} className="space-y-4">
        {mode === "register" && <input name="name" placeholder="Tên" className="w-full rounded-lg bg-gray-800 p-3" />}
        <input required name="email" type="email" placeholder="Email" className="w-full rounded-lg bg-gray-800 p-3" />
        <input required name="password" type="password" minLength={8} placeholder="Mật khẩu" className="w-full rounded-lg bg-gray-800 p-3" />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-blue-600 p-3 font-semibold disabled:opacity-50">
          {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
      </form>
      <div className="my-5 h-px bg-gray-800" />
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => void signIn("google", { redirectTo: "/" })} className="rounded-lg bg-gray-800 p-3">Google</button>
        <button onClick={() => void signIn("github", { redirectTo: "/" })} className="rounded-lg bg-gray-800 p-3">GitHub</button>
      </div>
      <Link href={mode === "login" ? "/register" : "/login"} className="mt-5 block text-center text-sm text-blue-400">
        {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
      </Link>
    </div>
  );
}
