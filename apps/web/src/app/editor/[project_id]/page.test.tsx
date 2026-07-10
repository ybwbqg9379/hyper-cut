import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function Passthrough({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}

mock.module("next/navigation", () => ({
	useParams: () => ({ project_id: "project-1" }),
	useRouter: () => ({ push: () => undefined }),
	useSearchParams: () => new URLSearchParams("embed=true"),
}));

mock.module("next-themes", () => ({
	useTheme: () => ({ theme: "dark", setTheme: () => undefined }),
}));

mock.module("@/components/providers/editor-provider", () => ({
	EditorProvider: Passthrough,
}));

mock.module("@/components/ui/resizable", () => ({
	ResizablePanelGroup: Passthrough,
	ResizablePanel: Passthrough,
	ResizableHandle: () => null,
}));

mock.module("@/components/editor/panels/assets", () => ({
	AssetsPanel: () => null,
}));
mock.module("@/components/editor/panels/properties", () => ({
	PropertiesPanel: () => null,
}));
mock.module("@/components/editor/panels/timeline", () => ({
	Timeline: () => null,
}));
mock.module("@/components/editor/panels/preview", () => ({
	PreviewPanel: () => null,
}));
mock.module("@/components/editor/onboarding", () => ({
	Onboarding: () => null,
}));
mock.module("@/components/editor/dialogs/migration-dialog", () => ({
	MigrationDialog: () => null,
}));
mock.module("@/components/editor/mobile-gate", () => ({
	MobileGate: Passthrough,
}));
mock.module("@/hooks/use-paste-media", () => ({
	usePasteMedia: () => undefined,
}));
mock.module("@/stores/panel-store", () => ({
	usePanelStore: () => ({
		panels: {
			mainContent: 65,
			timeline: 35,
			tools: 25,
			preview: 50,
			properties: 25,
		},
		setPanel: () => undefined,
	}),
}));

const editor = {
	project: {
		getActiveOrNull: () => null,
		cancelExport: () => undefined,
		clearExportState: () => undefined,
	},
};

mock.module("@/hooks/use-editor", () => ({
	useEditor: (selector?: (value: typeof editor) => unknown) =>
		selector ? selector(editor) : editor,
}));

test("embed mode keeps the export action without standalone header controls", async () => {
	const { default: Editor } = await import("./page");
	const html = renderToStaticMarkup(<Editor />);

	expect(html).toContain("Export");
	expect(html).not.toContain("HyperCut Logo");
	expect(html).not.toContain(">Light<");
});
