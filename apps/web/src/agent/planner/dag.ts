import type { AgentPlanStep } from "../types";

export type DagOperation = "read" | "write";
export type DagNodeState =
	| "pending"
	| "ready"
	| "running"
	| "completed"
	| "failed";

export interface DagNode {
	id: string;
	index: number;
	step: AgentPlanStep;
	operation: DagOperation;
	dependsOn: string[];
	resourceLocks: string[];
}

export interface DagPlan {
	nodes: DagNode[];
	byId: Record<string, DagNode>;
}

const READ_ONLY_PREFIXES = ["get_", "list_"];
const DEFAULT_WRITE_LOCK = "editor_write";

function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const normalized = value.trim();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
	}
	return result;
}

function inferOperation(step: AgentPlanStep): DagOperation {
	if (step.operation === "read" || step.operation === "write") {
		return step.operation;
	}
	for (const prefix of READ_ONLY_PREFIXES) {
		if (step.toolName.startsWith(prefix)) {
			return "read";
		}
	}
	return "write";
}

function normalizeDependencies({
	step,
	operation,
	knownIds,
	index,
	lastWriteId,
	previousIds,
}: {
	step: AgentPlanStep;
	operation: DagOperation;
	knownIds: Set<string>;
	index: number;
	lastWriteId: string | null;
	previousIds: string[];
}): string[] {
	const explicit = Array.isArray(step.dependsOn)
		? uniqueStrings(step.dependsOn)
		: [];
	if (explicit.length > 0) {
		return explicit.filter((id) => id !== step.id && knownIds.has(id));
	}

	if (index === 0) {
		return [];
	}

	if (operation === "read") {
		return lastWriteId ? [lastWriteId] : [];
	}

	return [...previousIds];
}

function normalizeLocks(
	step: AgentPlanStep,
	operation: DagOperation,
): string[] {
	if (Array.isArray(step.resourceLocks) && step.resourceLocks.length > 0) {
		return uniqueStrings(step.resourceLocks);
	}
	if (operation === "read") {
		return [];
	}
	return [DEFAULT_WRITE_LOCK];
}

export function buildDagFromPlanSteps(steps: AgentPlanStep[]): DagPlan {
	const knownIds = new Set(steps.map((step) => step.id));
	const nodes: DagNode[] = [];
	let lastWriteId: string | null = null;
	const previousIds: string[] = [];

	for (const [index, step] of steps.entries()) {
		const operation = inferOperation(step);
		const dependsOn = normalizeDependencies({
			step,
			operation,
			knownIds,
			index,
			lastWriteId,
			previousIds,
		});
		const resourceLocks = normalizeLocks(step, operation);

		const node: DagNode = {
			id: step.id,
			index,
			step,
			operation,
			dependsOn,
			resourceLocks,
		};
		nodes.push(node);
		previousIds.push(step.id);
		if (operation === "write") {
			lastWriteId = step.id;
		}
	}

	const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
	return { nodes, byId };
}

export function getTopologicalOrder(dag: DagPlan): string[] {
	const indegree = new Map<string, number>();
	const outgoing = new Map<string, string[]>();

	for (const node of dag.nodes) {
		indegree.set(node.id, node.dependsOn.length);
		for (const dep of node.dependsOn) {
			const next = outgoing.get(dep) ?? [];
			next.push(node.id);
			outgoing.set(dep, next);
		}
	}

	const queue = dag.nodes
		.filter((node) => (indegree.get(node.id) ?? 0) === 0)
		.sort((a, b) => a.index - b.index)
		.map((node) => node.id);

	const order: string[] = [];
	while (queue.length > 0) {
		const id = queue.shift();
		if (!id) break;
		order.push(id);
		const nextNodes = outgoing.get(id) ?? [];
		for (const nextId of nextNodes) {
			const nextValue = (indegree.get(nextId) ?? 0) - 1;
			indegree.set(nextId, nextValue);
			if (nextValue === 0) {
				queue.push(nextId);
			}
		}
	}

	if (order.length !== dag.nodes.length) {
		throw new Error("DAG contains cyclic dependencies");
	}

	return order;
}

export function getReadyDagNodes({
	dag,
	states,
	runningLocks,
}: {
	dag: DagPlan;
	states: Record<string, DagNodeState>;
	runningLocks: Set<string>;
}): DagNode[] {
	return dag.nodes.filter((node) => {
		if (states[node.id] !== "pending" && states[node.id] !== "ready") {
			return false;
		}
		const depsReady = node.dependsOn.every((id) => {
			const status = states[id];
			return status === "completed" || status === "failed";
		});
		if (!depsReady) {
			return false;
		}

		for (const lock of node.resourceLocks) {
			if (runningLocks.has(lock)) {
				return false;
			}
		}
		return true;
	});
}
