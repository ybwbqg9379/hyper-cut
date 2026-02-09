import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
	buildUpstreamGuardReport,
	collectCurrentUpstreamSnapshot,
	collectUpstreamGuardContext,
	readBaselineSnapshot,
	writeBaselineSnapshot,
} from "../src/agent/compat/upstream-guard";

interface CliOptions {
	baselinePath: string;
	reportPath: string | null;
	writeBaseline: boolean;
	failOnBlocking: boolean;
}

function parseCliOptions(argv: string[]): CliOptions {
	const options: CliOptions = {
		baselinePath: "src/agent/compat/upstream-baseline.json",
		reportPath: null,
		writeBaseline: false,
		failOnBlocking: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];

		if (token === "--write-baseline") {
			options.writeBaseline = true;
			continue;
		}
		if (token === "--fail-on-blocking") {
			options.failOnBlocking = true;
			continue;
		}
		if (token === "--baseline") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--baseline requires a path value");
			}
			options.baselinePath = value;
			index += 1;
			continue;
		}
		if (token === "--report") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--report requires a path value");
			}
			options.reportPath = value;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${token}`);
	}

	return options;
}

async function writeReportFile({
	rootDir,
	reportPath,
	report,
}: {
	rootDir: string;
	reportPath: string;
	report: unknown;
}): Promise<void> {
	const absolutePath = path.join(rootDir, reportPath);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
	const options = parseCliOptions(process.argv.slice(2));
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const rootDir = path.resolve(scriptDir, "..");
	const currentSnapshot = await collectCurrentUpstreamSnapshot({ rootDir });

	if (options.writeBaseline) {
		await writeBaselineSnapshot({
			rootDir,
			snapshot: currentSnapshot,
			baselinePath: options.baselinePath,
		});
		console.log(
			`[agent-upstream-guard] Baseline updated: ${options.baselinePath}`,
		);
		return;
	}

	const baseline = await readBaselineSnapshot({
		rootDir,
		baselinePath: options.baselinePath,
	});
	if (!baseline) {
		throw new Error(
			`Baseline not found: ${options.baselinePath}. Run with --write-baseline first.`,
		);
	}

	const context = await collectUpstreamGuardContext({ rootDir });
	const report = buildUpstreamGuardReport({
		baseline,
		current: currentSnapshot,
		context,
	});

	if (options.reportPath) {
		await writeReportFile({
			rootDir,
			reportPath: options.reportPath,
			report,
		});
	}

	console.log(JSON.stringify(report, null, 2));

	if (options.failOnBlocking && report.blockingIssues.length > 0) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(
		`[agent-upstream-guard] failed: ${
			error instanceof Error ? error.message : String(error)
		}`,
	);
	process.exit(1);
});
