import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  let tempVideoPath = "";

  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Bạn chưa chọn video." },
        { status: 400 }
      );
    }

    // Thử bằng video nhỏ trước để tránh đầy RAM.
    if (video.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        {
          success: false,
          error: "Video thử nghiệm phải nhỏ hơn 100 MB.",
        },
        { status: 413 }
      );
    }

    const originalExtension = path.extname(video.name);
    const safeExtension =
      originalExtension.replace(/[^a-zA-Z0-9.]/g, "") || ".mp4";

    tempVideoPath = path.join(
      os.tmpdir(),
      `cncsub-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}${safeExtension}`
    );

    const videoBuffer = Buffer.from(await video.arrayBuffer());
    await fs.writeFile(tempVideoPath, videoBuffer);

    const pythonScript = path.join(
      process.cwd(),
      "scripts",
      "transcribe.py"
    );

    await fs.access(pythonScript);

    const { stdout, stderr } = await execFileAsync(
      "python",
      [pythonScript, tempVideoPath],
      {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30 * 60 * 1000,
        env: {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
},


  
      }
    );

    if (stderr) {
      console.log("Whisper:", stderr);
    }

    const outputLines = stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);

    const jsonLine = [...outputLines]
      .reverse()
      .find((line) => line.trim().startsWith("{"));

    if (!jsonLine) {
      throw new Error(
        "Python không trả về kết quả JSON. Hãy kiểm tra transcribe.py."
      );
    }

    const result = JSON.parse(jsonLine) as {
      language?: string;
      language_probability?: number;
      text?: string;
      srt?: string;
      error?: string;
    };

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.srt) {
      throw new Error(
        "Không tạo được phụ đề. Video có thể không có tiếng nói."
      );
    }

    const baseName = path.parse(video.name).name || "subtitle";

    return NextResponse.json({
      success: true,
      filename: `${baseName}.srt`,
      language: result.language ?? "unknown",
      languageProbability: result.language_probability ?? 0,
      text: result.text ?? "",
      srt: result.srt,
    });
  } catch (error) {
    console.error("Transcribe API error:", error);

    const message =
error instanceof Error
        ? error.message
        : "Không thể tạo phụ đề.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  } finally {
    if (tempVideoPath) {
      await fs.unlink(tempVideoPath).catch(() => undefined);
    }
  }
}
