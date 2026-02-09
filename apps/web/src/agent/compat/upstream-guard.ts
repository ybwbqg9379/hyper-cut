import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { ACTIONS } from "../../lib/actions/definitions";
import { collectManagerCapabilities } from "../capabilities/collect-from-managers";
import { TOOL_CAPABILITY_BINDINGS } from "../capabilities/tool-bindings";

export interface UpstreamSnapshot {
	generatedAt: string;
	actions: string[];
	managerMethods: string[];
	commands: string[];
}

export interface UpstreamDiffSection {
	added: string[];
	removed: string[];
}

export interface UpstreamGuardDiff {
	actions: UpstreamDiffSection;
	managerMethods: UpstreamDiffSection;
	commands: UpstreamDiffSection;
}

export interface UpstreamGuardCoverage {
	newActionsWithoutToolBinding: string[];
	newManagerMethodsWithoutCapability: string[];
	newManagerMethodsWithoutToolBinding: string[];
	newCommandsWithoutAgentCoverage: string[];
}

export interface UpstreamGuardContext {
	managerCapabilityIds: string[];
	toolBoundActionCapabilityIds: string[];
	toolBoundManagerCapabilityIds: string[];
	agentCommandImportPrefixes: string[];
}

export interface UpstreamGuardReport {
	generatedAt: string;
	baselineGeneratedAt: string;
	diff: UpstreamGuardDiff;
	coverage: UpstreamGuardCoverage;
	blockingIssues: string[];
	warnings: string[];
}

const DEFAULT_BASELINE_PATH = "src/agent/compat/upstream-baseline.json";

const MANAGER_FILE_KEY_MAP: Record<string, string> = {
	"playback-manager.ts": "playback",
	"timeline-manager.ts": "timeline",
	"scenes-manager.ts": "scenes",
	"project-manager.ts": "project",
	"media-manager.ts": "media",
	"renderer-manager.ts": "renderer",
	"commands.ts": "command",
	"save-manager.ts": "save",
	"audio-manager.ts": "audio",
	"selection-manager.ts": "selection",
};

function uniqueSorted(values: string[]): string[] {
	return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function toPosixPath(value: string): string {
	return value.replace(/\\/g, "/");
}

function getAddedRemoved({
	current,
	baseline,
}: {
	current: string[];
	baseline: string[];
}): UpstreamDiffSection {
	const currentSet = new Set(current);
	const baselineSet = new Set(baseline);

	const added = current.filter((item) => !baselineSet.has(item));
	const removed = baseline.filter((item) => !currentSet.has(item));

	return {
		added: uniqueSorted(added),
		removed: uniqueSorted(removed),
	};
}

function parseClassMethodNames({
	sourceText,
	filePath,
}: {
	sourceText: string;
	filePath: string;
}): string[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const methods: string[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isClassDeclaration(statement) || !statement.name) {
			continue;
		}

		for (const member of statement.members) {
			if (!ts.isMethodDeclaration(member)) {
				continue;
			}

			const isPrivate = member.modifiers?.some(
				(modifier) =>
					modifier.kind === ts.SyntaxKind.PrivateKeyword ||
					modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
					modifier.kind === ts.SyntaxKind.StaticKeyword,
			);
			if (isPrivate) {
				continue;
			}

			if (member.name && ts.isIdentifier(member.name)) {
				methods.push(member.name.text);
			}
		}
	}

	return uniqueSorted(methods);
}

async function listFilesRecursively({
	dir,
	fileFilter,
}: {
	dir: string;
	fileFilter: (filePath: string) => boolean;
}): Promise<string[]> {
	const results: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const absolutePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const nested = await listFilesRecursively({
				dir: absolutePath,
				fileFilter,
			});
			results.push(...nested);
			continue;
		}
		if (entry.isFile() && fileFilter(absolutePath)) {
			results.push(absolutePath);
		}
	}

	return uniqueSorted(results);
}

async function safeReadFile(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

export async function collectCurrentUpstreamSnapshot({
	rootDir,
}: {
	rootDir: string;
}): Promise<UpstreamSnapshot> {
	const actions = uniqueSorted(Object.keys(ACTIONS));

	const managersDir = path.join(rootDir, "src/core/managers");
	const managerMethods: string[] = [];
	for (const [fileName, managerKey] of Object.entries(MANAGER_FILE_KEY_MAP)) {
		const managerFile = path.join(managersDir, fileName);
		const sourceText = await safeReadFile(managerFile);
		if (!sourceText) {
			continue;
		}
		const methods = parseClassMethodNames({
			sourceText,
			filePath: managerFile,
		});
		for (const method of methods) {
			managerMethods.push(`manager.${managerKey}.${method}`);
		}
	}

	const commandsDir = path.join(rootDir, "src/lib/commands");
	const commandFiles = await listFilesRecursively({
		dir: commandsDir,
		fileFilter: (filePath) =>
			filePath.endsWith(".ts") &&
			path.basename(filePath) !== "index.ts" &&
			path.basename(filePath) !== "base-command.ts",
	});
	const commands = commandFiles.map((filePath) =>
		path
			.relative(commandsDir, filePath)
			.replace(/\\/g, "/")
			.replace(/\.ts$/, ""),
	);

	return {
		generatedAt: new Date().toISOString(),
		actions,
		managerMethods: uniqueSorted(managerMethods),
		commands: uniqueSorted(commands),
	};
}

export async function collectUpstreamGuardContext({
	rootDir,
}: {
	rootDir: string;
}): Promise<UpstreamGuardContext> {
	const managerCapabilityIds = collectManagerCapabilities().map(
		(capability) => capability.id,
	);

	const toolCapabilityIds = Object.values(TOOL_CAPABILITY_BINDINGS).flat();
	const toolBoundActionCapabilityIds = toolCapabilityIds.filter(
		(capabilityId) => capabilityId.startsWith("action."),
	);
	const toolBoundManagerCapabilityIds = toolCapabilityIds.filter(
		(capabilityId) => capabilityId.startsWith("manager."),
	);

	const agentDir = path.join(rootDir, "src/agent");
	const agentFiles = await listFilesRecursively({
		dir: agentDir,
		fileFilter: (filePath) =>
			(filePath.endsWith(".ts") || filePath.endsWith(".tsx")) &&
			!toPosixPath(filePath).includes("/__tests__/"),
	});

	const commandImportPrefixes = new Set<string>();
	for (const filePath of agentFiles) {
		const sourceText = await safeReadFile(filePath);
		if (!sourceText) {
			continue;
		}
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		for (const statement of sourceFile.statements) {
			if (!ts.isImportDeclaration(statement)) {
				continue;
			}
			if (!ts.isStringLiteral(statement.moduleSpecifier)) {
				continue;
			}
			const modulePath = statement.moduleSpecifier.text;
			if (!modulePath.startsWith("@/lib/commands")) {
				continue;
			}
			const prefix = modulePath.replace(/^@\/lib\/commands\/?/, "");
			commandImportPrefixes.add(prefix);
		}
	}

	return {
		managerCapabilityIds: uniqueSorted(managerCapabilityIds),
		toolBoundActionCapabilityIds: uniqueSorted(toolBoundActionCapabilityIds),
		toolBoundManagerCapabilityIds: uniqueSorted(toolBoundManagerCapabilityIds),
		agentCommandImportPrefixes: uniqueSorted(Array.from(commandImportPrefixes)),
	};
}

export function buildUpstreamGuardReport({
	baseline,
	current,
	context,
}: {
	baseline: UpstreamSnapshot;
	current: UpstreamSnapshot;
	context: UpstreamGuardContext;
}): UpstreamGuardReport {
	const diff: UpstreamGuardDiff = {
		actions: getAddedRemoved({
			current: current.actions,
			baseline: baseline.actions,
		}),
		managerMethods: getAddedRemoved({
			current: current.managerMethods,
			baseline: baseline.managerMethods,
		}),
		commands: getAddedRemoved({
			current: current.commands,
			baseline: baseline.commands,
		}),
	};

	const managerCapabilitySet = new Set(context.managerCapabilityIds);
	const actionToolBindingSet = new Set(context.toolBoundActionCapabilityIds);
	const managerToolBindingSet = new Set(context.toolBoundManagerCapabilityIds);
	const commandImportPrefixes = context.agentCommandImportPrefixes;

	const newActionsWithoutToolBinding = diff.actions.added.filter(
		(actionName) => !actionToolBindingSet.has(`action.${actionName}`),
	);
	const newManagerMethodsWithoutCapability = diff.managerMethods.added.filter(
		(managerMethod) => !managerCapabilitySet.has(managerMethod),
	);
	const newManagerMethodsWithoutToolBinding = diff.managerMethods.added.filter(
		(managerMethod) => !managerToolBindingSet.has(managerMethod),
	);
	const newCommandsWithoutAgentCoverage = diff.commands.added.filter(
		(commandPath) =>
			!commandImportPrefixes.some(
				(prefix) => prefix.length === 0 || commandPath.startsWith(prefix),
			),
	);

	const removedActionsReferencedByTools = diff.actions.removed.filter(
		(actionName) => actionToolBindingSet.has(`action.${actionName}`),
	);
	const removedManagerMethodsReferencedByTools =
		diff.managerMethods.removed.filter((managerMethod) =>
			managerToolBindingSet.has(managerMethod),
		);

	const blockingIssues: string[] = [];
	const warnings: string[] = [];

	if (newActionsWithoutToolBinding.length > 0) {
		blockingIssues.push(
			`新增 action 未绑定工具: ${newActionsWithoutToolBinding.join(", ")}`,
		);
	}
	if (newManagerMethodsWithoutCapability.length > 0) {
		blockingIssues.push(
			`新增 manager 方法未进入 capability 映射: ${newManagerMethodsWithoutCapability.join(", ")}`,
		);
	}
	if (removedActionsReferencedByTools.length > 0) {
		blockingIssues.push(
			`已有工具引用的 action 在 upstream 被移除: ${removedActionsReferencedByTools.join(", ")}`,
		);
	}
	if (removedManagerMethodsReferencedByTools.length > 0) {
		blockingIssues.push(
			`已有工具引用的 manager 方法在 upstream 被移除: ${removedManagerMethodsReferencedByTools.join(", ")}`,
		);
	}
	if (newManagerMethodsWithoutToolBinding.length > 0) {
		warnings.push(
			`新增 manager 方法未绑定工具: ${newManagerMethodsWithoutToolBinding.join(", ")}`,
		);
	}
	if (newCommandsWithoutAgentCoverage.length > 0) {
		warnings.push(
			`新增 command 未被 Agent 显式导入: ${newCommandsWithoutAgentCoverage.join(", ")}`,
		);
	}
	if (diff.commands.removed.length > 0) {
		warnings.push(
			`upstream 移除了 command: ${diff.commands.removed.join(", ")}`,
		);
	}

	return {
		generatedAt: current.generatedAt,
		baselineGeneratedAt: baseline.generatedAt,
		diff,
		coverage: {
			newActionsWithoutToolBinding: uniqueSorted(newActionsWithoutToolBinding),
			newManagerMethodsWithoutCapability: uniqueSorted(
				newManagerMethodsWithoutCapability,
			),
			newManagerMethodsWithoutToolBinding: uniqueSorted(
				newManagerMethodsWithoutToolBinding,
			),
			newCommandsWithoutAgentCoverage: uniqueSorted(
				newCommandsWithoutAgentCoverage,
			),
		},
		blockingIssues: uniqueSorted(blockingIssues),
		warnings: uniqueSorted(warnings),
	};
}

export async function readBaselineSnapshot({
	rootDir,
	baselinePath = DEFAULT_BASELINE_PATH,
}: {
	rootDir: string;
	baselinePath?: string;
}): Promise<UpstreamSnapshot | null> {
	const baselineAbsolutePath = path.join(rootDir, baselinePath);
	const baselineRaw = await safeReadFile(baselineAbsolutePath);
	if (!baselineRaw) {
		return null;
	}
	const parsed = JSON.parse(baselineRaw) as Partial<UpstreamSnapshot>;
	return {
		generatedAt:
			typeof parsed.generatedAt === "string"
				? parsed.generatedAt
				: new Date(0).toISOString(),
		actions: Array.isArray(parsed.actions) ? uniqueSorted(parsed.actions) : [],
		managerMethods: Array.isArray(parsed.managerMethods)
			? uniqueSorted(parsed.managerMethods)
			: [],
		commands: Array.isArray(parsed.commands)
			? uniqueSorted(parsed.commands)
			: [],
	};
}

export async function writeBaselineSnapshot({
	rootDir,
	snapshot,
	baselinePath = DEFAULT_BASELINE_PATH,
}: {
	rootDir: string;
	snapshot: UpstreamSnapshot;
	baselinePath?: string;
}): Promise<void> {
	const baselineAbsolutePath = path.join(rootDir, baselinePath);
	await mkdir(path.dirname(baselineAbsolutePath), { recursive: true });
	await writeFile(
		baselineAbsolutePath,
		`${JSON.stringify(snapshot, null, 2)}\n`,
		"utf8",
	);
}
