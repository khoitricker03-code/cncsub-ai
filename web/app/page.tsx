import ProjectList from "./components/ProjectList";
import VideoUploader from "./components/VideoUploader";
import UserMenu from "./components/UserMenu";
import { auth } from "@/auth";
import { isDevelopmentAuthBypassEnabled } from "@/lib/services/auth-flags";

export default async function Home() {
  const developmentBypass = isDevelopmentAuthBypassEnabled();
  const session = developmentBypass ? null : await auth();
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl">

        {/* Sidebar */}

        <aside className="w-80 border-r border-gray-800 bg-gray-900 p-6">

          <h2 className="mb-6 text-2xl font-bold">
            CNCSub AI
          </h2>

          {developmentBypass ? (
            <div className="mb-5 rounded-lg bg-amber-950 p-3 text-xs text-amber-200">
              Local development • Authentication disabled
            </div>
          ) : (
            <UserMenu email={session?.user.email} />
          )}

          <button className="mb-6 w-full rounded-xl bg-blue-600 py-3 font-semibold hover:bg-blue-700">
            + New Project
          </button>

          <ProjectList />

        </aside>

        {/* Main */}

        <section className="flex-1 p-10">

          <h1 className="mb-3 text-5xl font-bold">
            CNCSub AI
          </h1>

          <p className="mb-10 text-gray-400">
            AI tạo phụ đề • Dịch • Lồng tiếng
          </p>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8">

            <VideoUploader />

            <div className="mt-8 grid grid-cols-2 gap-4">

              <select className="rounded-lg bg-gray-800 p-3">

                <option>Tiếng Việt</option>
                <option>English</option>
                <option>中文</option>
                <option>日本語</option>
                <option>한국어</option>

              </select>

              <select className="rounded-lg bg-gray-800 p-3">

                <option>Tiếng Việt</option>
                <option>English</option>
                <option>中文</option>
                <option>日本語</option>
                <option>한국어</option>

              </select>

            </div>

            <button className="mt-8 w-full rounded-xl bg-blue-600 py-4 text-xl font-bold hover:bg-blue-700">
              🚀 Tạo phụ đề
            </button>

          </div>

        </section>

      </div>
    </main>
  );
}