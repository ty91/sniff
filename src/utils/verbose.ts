export type VerboseWriter = (line: string) => void;

export type VerboseLogger = (label: string, values: Record<string, number>) => void;

const DEFAULT_WRITER: VerboseWriter = (line) => {
  process.stderr.write(`${line}\n`);
};

export function createVerboseLogger(
  enabled: boolean,
  writer: VerboseWriter = DEFAULT_WRITER
): VerboseLogger {
  return (label, values) => {
    if (!enabled) return;
    const parts = Object.entries(values).map(([key, value]) => `${key}=${value}`);
    const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
    writer(`[verbose] ${label}${suffix}`);
  };
}
