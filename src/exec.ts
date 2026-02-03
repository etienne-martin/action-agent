import { getExecOutput } from '@actions/exec';
import type { ExecListeners, ExecOptions } from '@actions/exec';

type StreamMode = 'stdout' | 'stderr' | 'both';

const buildCommandError = (
  command: string,
  args: string[],
  stdout: string,
  stderr: string,
  exitCode: number,
): string => {
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();
  const formatArg = (arg: string): string => {
    if (arg.includes('\n')) return '<omitted>';
    const normalized = arg.replace(/\s+/g, ' ').trim();
    return normalized.length > 160 ? '<omitted>' : normalized;
  };
  const formattedArgs = args.map(formatArg);
  const details = [trimmedStdout, trimmedStderr].filter(Boolean).join('\n\n');
  const base = `Command failed: ${[command, ...formattedArgs].join(' ')}`;
  return details ? `${base}\n\n${details}` : `${base} (exit code ${exitCode})`;
};

const buildListeners = (stream: StreamMode): ExecListeners => {
  return {
    stdout: ['stdout', 'both'].includes(stream) ? (data) => process.stdout.write(data) : undefined,
    stderr: ['stderr', 'both'].includes(stream) ? (data) => process.stderr.write(data) : undefined,
  };
};

export const runCommand = async (
  command: string,
  args: string[],
  options: ExecOptions = {},
  stream: StreamMode = 'both',
): Promise<void> => {
  const result = await getExecOutput(command, args, {
    ...options,
    ignoreReturnCode: true,
    silent: true,
    listeners: buildListeners(stream),
  });

  if (result.exitCode !== 0) {
    throw new Error(buildCommandError(command, args, result.stdout, result.stderr, result.exitCode));
  }
};
