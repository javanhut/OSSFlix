export type ProbeStream = {
  index?: number;
  codec_type?: string;
  channels?: number;
};

export type SelectedAudioStream = {
  index: number;
  channels: number;
};

const STEREO_DOWNMIX_FILTER =
  "pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE";

function buildAudioFilters(channels: number): string {
  const filters: string[] = [];
  if (channels > 2) {
    filters.push(STEREO_DOWNMIX_FILTER);
  }
  filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  filters.push("aresample=async=1:first_pts=0");
  return filters.join(",");
}

export function selectAudioStream(streams: ProbeStream[], audioIndex: number): SelectedAudioStream | null {
  const audioStreams = streams.filter((s) => s.codec_type === "audio");
  const selected = audioStreams[audioIndex] || audioStreams[0];
  if (!selected || typeof selected.index !== "number") {
    return null;
  }
  return {
    index: selected.index,
    channels: selected.channels || 2,
  };
}

export function buildCacheTranscodeArgs(
  sourcePath: string,
  selectedAudio: SelectedAudioStream | null,
  outputPath: string
): string[] {
  return [
    "ffmpeg",
    "-y",
    "-i",
    sourcePath,
    "-fflags",
    "+genpts",
    "-map",
    "0:v:0",
    ...(selectedAudio ? ["-map", `0:${selectedAudio.index}`] : []),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    ...(selectedAudio
      ? ["-c:a", "aac", "-ac", "2", "-b:a", "192k", "-af", buildAudioFilters(selectedAudio.channels)]
      : []),
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "9999",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outputPath,
  ];
}

export function buildLiveTranscodeArgs(
  sourcePath: string,
  selectedAudio: SelectedAudioStream | null,
  startTime: number
): string[] {
  const seekWindow = 30;
  const preSeek = startTime > 0 ? Math.max(0, startTime - seekWindow) : 0;
  const postSeek = startTime > 0 ? startTime - preSeek : 0;

  return [
    "ffmpeg",
    ...(preSeek > 0 ? ["-ss", String(preSeek)] : []),
    "-i",
    sourcePath,
    ...(postSeek > 0 ? ["-ss", String(postSeek), "-accurate_seek"] : []),
    "-fflags",
    "+genpts",
    "-map",
    "0:v:0",
    ...(selectedAudio ? ["-map", `0:${selectedAudio.index}`] : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    ...(selectedAudio
      ? ["-c:a", "aac", "-ac", "2", "-b:a", "192k", "-af", buildAudioFilters(selectedAudio.channels)]
      : []),
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "9999",
    "-movflags",
    "frag_keyframe+empty_moov+faststart",
    "-f",
    "mp4",
    "-",
  ];
}
