import ProjectList from "./components/ProjectList";
import UploadWorkspace from "./components/UploadWorkspace";
import UserMenu from "./components/UserMenu";
import {
  getCurrentSession,
  isDevelopmentAuthBypassEnabled,
} from "@/lib/services/auth-context";

export default async function Home() {
  const developmentBypass = isDevelopmentAuthBypassEnabled();
  const session = await getCurrentSession();
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

          <a
            href="#upload-workspace"
            className="mb-6 block w-full rounded-xl bg-blue-600 py-3 text-center font-semibold hover:bg-blue-700"
          >
            + New Project
          </a>

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

          <div
            id="upload-workspace"
            className="scroll-mt-8 rounded-2xl border border-gray-800 bg-gray-900 p-8"
          >

            <UploadWorkspace />

          </div>

        </section>

      </div>
    </main>
  );
}
