export type ProgressCounts = {
  processed: number;
  total: number;
  updated: number;
  skipped: number;
};

export type ProgressReporter = {
  update: (counts: ProgressCounts) => void;
  finish: (counts: ProgressCounts) => void;
};

type ProgressOptions = {
  total: number;
  interval?: number;
  label?: string;
  isTTY?: boolean;
};

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

export function createProgressReporter(options: ProgressOptions): ProgressReporter {
  const total = Math.max(0, Math.floor(options.total));
  const interval = Math.max(1, Math.floor(options.interval ?? 25));
  const label = options.label ?? "sync";
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY);
  let frameIndex = 0;
  let lastLine = "";
  let lastLogged = -1;

  const formatLine = (counts: ProgressCounts, prefix: string) =>
    `${prefix} ${label} ${counts.processed}/${total} updated:${counts.updated} skipped:${counts.skipped}`;

  const renderTTY = (counts: ProgressCounts, prefix: string) => {
    const line = formatLine(counts, prefix);
    const padding = lastLine.length > line.length ? " ".repeat(lastLine.length - line.length) : "";
    process.stdout.write(`\r${line}${padding}`);
    lastLine = line;
  };

  return {
    update: (counts) => {
      if (isTTY) {
        const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
        frameIndex += 1;
        renderTTY(counts, frame);
        return;
      }

      const shouldLog = counts.processed === total || counts.processed % interval === 0;
      if (!shouldLog || counts.processed === lastLogged) return;
      lastLogged = counts.processed;
      console.log(formatLine(counts, "progress"));
    },
    finish: (counts) => {
      if (isTTY) {
        renderTTY(counts, "done");
        process.stdout.write("\n");
        return;
      }
      console.log(formatLine(counts, "done"));
    },
  };
}
