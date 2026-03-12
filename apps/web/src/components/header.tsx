"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import { Menu02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";
import { DEFAULT_LOGO_URL } from "@/constants/site-constants";

export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const closeMenu = () => setIsMenuOpen(false);

	return (
		<header className="bg-background shadow-background/85 sticky top-0 z-10 shadow-[0_30px_35px_15px_rgba(0,0,0,1)]">
			<div className="relative flex w-full items-center justify-between px-6 pt-4">
				<div className="relative z-10 flex items-center gap-6">
					<Link href="/" className="flex items-center gap-3">
						<Image
							src={DEFAULT_LOGO_URL}
							alt="HyperCut Logo"
							className="invert dark:invert-0"
							width={32}
							height={32}
						/>
					</Link>
				</div>

				<div className="relative z-10">
					<div className="flex items-center gap-3 md:hidden">
						<Button
							variant="text"
							size="icon"
							className="flex items-center justify-center p-0"
							onClick={() => setIsMenuOpen(!isMenuOpen)}
						>
							<HugeiconsIcon icon={Menu02Icon} size={30} />
						</Button>
					</div>
					<div className="hidden items-center gap-3 md:flex">
						<Link href="/projects">
							<Button className="text-sm">
								Projects
								<ArrowRight className="size-4" />
							</Button>
						</Link>
						<ThemeToggle />
					</div>
				</div>
				<div
					className={cn(
						"bg-background/20 pointer-events-none fixed inset-0 opacity-0 backdrop-blur-3xl",
						"transition-opacity duration-150",
						isMenuOpen && "pointer-events-auto opacity-100",
					)}
				>
					<div className="relative h-full">
						<button
							type="button"
							aria-label="Close menu"
							className="absolute inset-0"
							onClick={closeMenu}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" ||
									event.key === " " ||
									event.key === "Escape"
								) {
									event.preventDefault();
									closeMenu();
								}
							}}
						/>
						<nav className="flex flex-col gap-3 px-6 pt-[5rem]">
							<Link
								href="/projects"
								className="text-2xl font-semibold"
								onClick={() => setIsMenuOpen(false)}
							>
								Projects
							</Link>
						</nav>
						<ThemeToggle
							className="absolute right-8 bottom-8 size-10"
							iconClassName="!size-[1.2rem]"
							onToggle={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
