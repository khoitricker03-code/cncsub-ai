import VideoUploader from "./components/VideoUploader";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-4xl p-8">
        <h1 className="text-5xl font-bold text-center mb-4">CNCSub AI</h1>

        <p className="text-center text-gray-400 mb-10">
          AI tạo phụ đề • Dịch • Lồng tiếng
        </p>

        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          <VideoUploader />

          <div className="grid grid-cols-2 gap-4 mt-8">
            <select className="bg-gray-800 p-3 rounded-lg">
              <option>Tiếng Việt</option>
              <option>English</option>
              <option>中文 (Chinese)</option>
              <option>日本語</option>
              <option>한국어</option>
            </select>

            <select className="bg-gray-800 p-3 rounded-lg">
              <option>Tiếng Việt</option>
              <option>English</option>
              <option>中文 (Chinese)</option>
              <option>日本語</option>
              <option>한국어</option>
            </select>
          </div>

          <button className="mt-8 w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-4 text-xl font-bold">
            🚀 Tạo phụ đề
          </button>
        </div>
      </div>
    </main>
  );
}
