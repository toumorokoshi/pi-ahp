import {
	ActionType,
	type BackgroundShellWork,
	type BackgroundWork,
	BackgroundWorkKind,
	type ChatAction,
} from "@microsoft/agent-host-protocol";
import type { BackgroundProcess } from "./processes.ts";

/**
 * `SessionSummary._meta` key holding how many background work entries the
 * session's chat has, so clients that only follow the session list (and do
 * not subscribe to every chat) can tell the session is still working.
 */
export const BACKGROUND_WORK_META = "pi-agent-host-protocol/backgroundWork";

/** How often the host looks for background processes, in `rpc` mode. */
export const BACKGROUND_WORK_INTERVAL_MS = 5_000;

/** Longest label published for a process; the full command line is in `command`. */
const LABEL_LENGTH = 80;

const ID_PREFIX = "process:";

/** The background work entry id of a process. */
export function backgroundWorkId(pid: number): string {
	return `${ID_PREFIX}${pid}`;
}

/** A process pi started, as a background shell. */
export function shellWork(process: BackgroundProcess, startedAt: string): BackgroundShellWork {
	const command = process.command || `process ${process.pid}`;
	return {
		kind: BackgroundWorkKind.Shell,
		id: backgroundWorkId(process.pid),
		label: command.length > LABEL_LENGTH ? `${command.slice(0, LABEL_LENGTH - 1)}…` : command,
		startedAt,
		command,
		_meta: { pid: process.pid },
	};
}

export interface BackgroundWorkObservation {
	/** pi's background processes now. */
	readonly processes: readonly BackgroundProcess[];
	/**
	 * A turn is running. New processes are then not published: they are most
	 * likely a tool the turn is waiting on. Those still running when the turn
	 * ends are published by the next observation.
	 */
	readonly running: boolean;
	/** ISO 8601 time to give new entries as `startedAt`. */
	readonly now: string;
}

/**
 * The `chat/backgroundWork*` actions that bring a chat's `current` entries
 * in line with what was observed: entries of processes that ended are
 * removed, and processes not listed yet are added (unless a turn runs).
 * Entries this host did not derive from a process are left alone.
 */
export function backgroundWorkActions(
	current: readonly BackgroundWork[],
	observation: BackgroundWorkObservation,
): ChatAction[] {
	const found = new Map(observation.processes.map((process) => [backgroundWorkId(process.pid), process]));
	const listed = new Set(current.map((work) => work.id));
	const removed: ChatAction[] = current
		.filter((work) => work.id.startsWith(ID_PREFIX) && !found.has(work.id))
		.map((work) => ({ type: ActionType.ChatBackgroundWorkRemoved, id: work.id }));
	const added: ChatAction[] = observation.running
		? []
		: [...found]
				.filter(([id]) => !listed.has(id))
				.map(([, process]) => ({
					type: ActionType.ChatBackgroundWorkSet,
					work: shellWork(process, observation.now),
				}));
	return [...removed, ...added];
}

/** The session summary `_meta` that reports `count` background work entries. */
export function backgroundWorkMeta(count: number): Record<string, unknown> {
	return count > 0 ? { [BACKGROUND_WORK_META]: count } : {};
}
