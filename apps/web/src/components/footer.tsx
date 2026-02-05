import Image from "next/image";
import { DEFAULT_LOGO_URL } from "@/constants/site-constants";

export function Footer() {
	return (
		<footer className="bg-background border-t">
			<div className="mx-auto max-w-5xl px-8 py-6">
				<div className="flex flex-col items-center justify-center gap-4 md:flex-row md:justify-between">
					<div className="flex items-center gap-2">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="HyperCut"
							width={24}
							height={24}
							className="invert dark:invert-0"
						/>
						<span className="text-lg font-bold">HyperCut</span>
					</div>
					<div className="text-muted-foreground text-sm">
						© {new Date().getFullYear()} HyperCut, All Rights Reserved
					</div>
				</div>
			</div>
		</footer>
	);
}
