import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

test("AI Dubbing produces a playable rendered MP4", async ({ page, request }) => {
  test.setTimeout(180_000);
  const createResponse = await request.post("/api/projects", {
    data: { name: "AI Dubbing acceptance" },
  });
  expect(createResponse.ok()).toBe(true);
  const created = await createResponse.json() as { project: { id: string } };
  const projectId = created.project.id;
  const projectRoot = path.join(process.cwd(), "storage", "projects", projectId);

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=0x243047:s=640x360:d=5:r=30",
      "-f", "lavfi",
      "-i", "sine=frequency=220:sample_rate=48000:duration=5",
      "-shortest",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-movflags", "+faststart",
      path.join(projectRoot, "media", "input.mp4"),
    ], { windowsHide: true });

    const originalSegments = [
      { id: 1, start: 0.4, end: 2.4, text: "Hello from the original track." },
      { id: 2, start: 2.6, end: 4.7, text: "The dubbing pipeline is working." },
    ];
    const translatedSegments = [
      { id: 1, start: 0.4, end: 2.4, text: "Xin chào từ bản dịch." },
      { id: 2, start: 2.6, end: 4.7, text: "Quy trình lồng tiếng đang hoạt động." },
    ];
    expect((await request.put(`/api/projects/${projectId}`, {
      data: { segments: originalSegments },
    })).ok()).toBe(true);
    expect((await request.put(`/api/projects/${projectId}?track=translation&language=vi`, {
      data: { segments: translatedSegments },
    })).ok()).toBe(true);

    await page.goto(`/projects/${projectId}`);
    const dubbingButton = page.getByRole("button", { name: /AI Dubbing/i });
    await expect(dubbingButton).toBeEnabled();
    await dubbingButton.click();

    await expect(page.getByText(/Lỗi:|Error:/i)).toHaveCount(0);
    const video = page.locator("video");
    await expect(video).toHaveAttribute("src", /rendered=true/, { timeout: 120_000 });

    const voicePath = path.join(projectRoot, "render", "voice.wav");
    const mixedPath = path.join(projectRoot, "render", "mixed.wav");
    const finalPath = path.join(projectRoot, "render", "output.mp4");
    const [voice, mixed] = await Promise.all([readFile(voicePath), readFile(mixedPath)]);
    expect(voice.byteLength).toBeGreaterThan(1_000);
    expect(Buffer.compare(voice, mixed)).toBe(0);

    const durations = await Promise.all([voicePath, path.join(projectRoot, "media", "input.mp4")].map(
      (file) => execFileAsync("ffprobe", [
        "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
      ], { windowsHide: true }),
    ));
    expect(Math.abs(Number(durations[0].stdout) - Number(durations[1].stdout))).toBeLessThan(0.05);

    const volume = await execFileAsync("ffmpeg", [
      "-hide_banner", "-i", voicePath, "-af", "volumedetect", "-f", "null", "-",
    ], { windowsHide: true });
    const maxVolume = /max_volume:\s*(-?\d+(?:\.\d+)?|-inf)\s*dB/i.exec(volume.stderr);
    expect(maxVolume).not.toBeNull();
    expect(maxVolume?.[1].toLowerCase()).not.toBe("-inf");
    expect(Number(maxVolume?.[1])).toBeGreaterThan(-80);

    const silence = await execFileAsync("ffmpeg", [
      "-hide_banner", "-i", voicePath, "-af", "silencedetect=noise=-40dB:d=0.05", "-f", "null", "-",
    ], { windowsHide: true });
    const leadingSilence = /silence_end:\s*([0-9.]+)/i.exec(silence.stderr);
    expect(leadingSilence).not.toBeNull();
    expect(Number(leadingSilence?.[1])).toBeGreaterThan(0.35);

    const audioProbe = await execFileAsync("ffprobe", [
      "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "default=nw=1", finalPath,
    ], { windowsHide: true });
    expect(audioProbe.stdout).toMatch(/codec_name=aac/i);

    const playback = await video.evaluate(async (element) => {
      const player = element as HTMLVideoElement;
      player.muted = true;
      await player.play();
      await new Promise((resolve) => setTimeout(resolve, 750));
      const result = {
        currentTime: player.currentTime,
        duration: player.duration,
        paused: player.paused,
        readyState: player.readyState,
        error: player.error?.message ?? null,
      };
      player.pause();
      return result;
    });

    expect(playback.error).toBeNull();
    expect(playback.readyState).toBeGreaterThanOrEqual(2);
    expect(playback.duration).toBeGreaterThan(0);
    expect(playback.currentTime).toBeGreaterThan(0);
    expect(playback.paused).toBe(false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
