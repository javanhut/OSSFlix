export type ProbeStream = {
  index?: number;
  codec_type?: string;
  channels?: number;
  codec_name?: string;
  pix_fmt?: string;
};

export type SelectedAudioStream = {
  index: number;
  channels: number;
  codecName: string;
};

const STEREO_DOWNMIX_FILTER =
  "pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE";

export type SelectedVideoStream = {
  index: number;
  codecName: string;
  pixFmt: string;
};

function buildCacheAudioFilters(channels: number): string {
  const filters: string[] = [];
  if (channels > 2) {
    filters.push(STEREO_DOWNMIX_FILTER);
  }
  filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  filters.push("aresample=async=1:first_pts=0");
  return filters.join(",");
}

function buildLiveAudioFilters(channels: number): string {
  const filters: string[] = [];
  if (channels > 2) {
    filters.push(STEREO_DOWNMIX_FILTER);
  }
  // Keep live transcode low-latency. Loudness normalization is deferred to cache jobs.
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
    codecName: (selected.codec_name || "").toLowerCase(),
  };
}

export function selectVideoStream(streams: ProbeStream[]): SelectedVideoStream | null {
  const selected = streams.find((s) => s.codec_type === "video");
  if (!selected || typeof selected.index !== "number") {
    return null;
  }
  return {
    index: selected.index,
    codecName: (selected.codec_name || "").toLowerCase(),
    pixFmt: (selected.pix_fmt || "").toLowerCase(),
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
    "fast",
    "-crf",
    "22",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    ...(selectedAudio
      ? ["-c:a", "aac", "-ac", "2", "-b:a", "192k", "-af", buildCacheAudioFilters(selectedAudio.channels)]
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
  selectedVideo: SelectedVideoStream | null,
  startTime: number
): string[] {
  const seekWindow = 30;
  const preSeek = startTime > 0 ? Math.max(0, startTime - seekWindow) : 0;
  const postSeek = startTime > 0 ? startTime - preSeek : 0;
  const canCopyVideo = !!selectedVideo && selectedVideo.codecName === "h264" && selectedVideo.pixFmt === "yuv420p" && startTime <= 0;
  const canCopyAudio = !!selectedAudio && selectedAudio.codecName === "aac" && selectedAudio.channels <= 2;

  return [
    "ffmpeg",
    "-probesize",
    "10M",
    "-analyzeduration",
    "10M",
    ...(preSeek > 0 ? ["-ss", String(preSeek)] : []),
    "-i",
    sourcePath,
    ...(postSeek > 0 ? ["-ss", String(postSeek), "-accurate_seek"] : []),
    "-fflags",
    "+genpts",
    "-map",
    "0:v:0",
    ...(selectedAudio ? ["-map", `0:${selectedAudio.index}`] : []),
    ...(canCopyVideo
      ? ["-c:v", "copy"]
      : [
          "-c:v",
          "libx264",
          "-preset",
          "superfast",
          "-tune",
          "zerolatency",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-profile:v",
          "high",
        ]),
    ...(selectedAudio
      ? (canCopyAudio
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-ac", "2", "-b:a", "192k", "-af", buildLiveAudioFilters(selectedAudio.channels)])
      : []),
    "-avoid_negative_ts",
    "make_zero",
    "-muxpreload",
    "0",
    "-muxdelay",
    "0",
    "-max_muxing_queue_size",
    "9999",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof+faststart",
    "-frag_duration",
    "1000000",
    "-f",
    "mp4",
    "-",
  ];
}
