import { execFile } from "node:child_process";

/** One row of the process table. */
export interface ProcessEntry {
	readonly ppid: number;
	/** The command line (`ps`'s `args`); empty if `ps` did not report one. */
	readonly command: string;
}

/** Every process, keyed by pid. */
export type ProcessTable = ReadonlyMap<number, ProcessEntry>;

/** A process pi started after it became ready. */
export interface BackgroundProcess {
	readonly pid: number;
	readonly command: string;
}

const ROW = /^\s*(\d+)\s+(\d+)(?:\s+(.*))?$/;

/** Parses `ps -A -o pid=,ppid=,args=` output. Lines that do not start with two numbers are skipped. */
export function parseProcessTable(output: string): ProcessTable {
	const table = new Map<number, ProcessEntry>();
	for (const line of output.split("\n")) {
		const match = ROW.exec(line);
		if (match) table.set(Number(match[1]), { ppid: Number(match[2]), command: match[3]?.trim() ?? "" });
	}
	return table;
}

/** Direct children of `pid`. */
export function childrenOf(table: ProcessTable, pid: number): Set<number> {
	const children = new Set<number>();
	for (const [child, entry] of table) if (entry.ppid === pid) children.add(child);
	return children;
}

/**
 * Children of `pid` that were not there when the baseline was taken: processes
 * pi started since (background jobs, subagents, a tool still running).
 * Processes started at pi's startup, such as MCP servers, are in the baseline.
 */
export function newChildren(table: ProcessTable, pid: number, baseline: ReadonlySet<number>): BackgroundProcess[] {
	return [...childrenOf(table, pid)]
		.filter((child) => !baseline.has(child))
		.map((child) => ({ pid: child, command: table.get(child)?.command ?? "" }));
}

/** Reads the system's process table with `ps` (Linux and macOS). */
export function readProcessTable(): Promise<ProcessTable> {
	return new Promise((resolve, reject) => {
		execFile("ps", ["-A", "-o", "pid=,ppid=,args="], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
			if (error) reject(error);
			else resolve(parseProcessTable(stdout));
		});
	});
}
