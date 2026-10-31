import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ActionType, BackgroundWorkKind } from "@microsoft/agent-host-protocol";
import {
	BACKGROUND_WORK_META,
	backgroundWorkActions,
	backgroundWorkId,
	backgroundWorkMeta,
	shellWork,
} from "../src/pi/background-work.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const devServer = { pid: 10, command: "npm run dev" };
const tests = { pid: 11, command: "npm test" };

describe("background work", () => {
	test("a process becomes a shell entry keyed by its pid", () => {
		assert.deepEqual(shellWork(devServer, NOW), {
			kind: BackgroundWorkKind.Shell,
			id: "process:10",
			label: "npm run dev",
			startedAt: NOW,
			command: "npm run dev",
			_meta: { pid: 10 },
		});
		const long = shellWork({ pid: 12, command: "x".repeat(200) }, NOW);
		assert.equal(long.label.length, 80);
		assert.ok(long.label.endsWith("…"));
		assert.equal(long.command.length, 200);
		assert.equal(shellWork({ pid: 13, command: "" }, NOW).command, "process 13");
	});

	test("adds new processes and removes ended ones", () => {
		const current = [shellWork(devServer, NOW)];
		assert.deepEqual(backgroundWorkActions(current, { processes: [tests], running: false, now: NOW }), [
			{ type: ActionType.ChatBackgroundWorkRemoved, id: backgroundWorkId(10) },
			{ type: ActionType.ChatBackgroundWorkSet, work: shellWork(tests, NOW) },
		]);
		assert.deepEqual(backgroundWorkActions(current, { processes: [devServer], running: false, now: NOW }), []);
	});

	test("does not add processes while a turn runs, but still removes ended ones", () => {
		const current = [shellWork(devServer, NOW)];
		assert.deepEqual(backgroundWorkActions(current, { processes: [tests], running: true, now: NOW }), [
			{ type: ActionType.ChatBackgroundWorkRemoved, id: backgroundWorkId(10) },
		]);
	});

	test("leaves entries it did not derive from a process", () => {
		const subagent = {
			kind: BackgroundWorkKind.Subagent as const,
			id: "subagent:a",
			label: "reviewer",
			startedAt: NOW,
			chat: "ahp-chat:/b",
		};
		assert.deepEqual(backgroundWorkActions([subagent], { processes: [], running: false, now: NOW }), []);
	});

	test("the summary _meta carries the count only while there is work", () => {
		assert.deepEqual(backgroundWorkMeta(2), { [BACKGROUND_WORK_META]: 2 });
		assert.deepEqual(backgroundWorkMeta(0), {});
	});
});
