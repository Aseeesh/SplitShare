import { FadeIn } from "@/components/ui/motion";

/**
 * Re-mounts on every navigation, so each page fades in like a native screen
 * change. Opacity only: a transform here would become the containing block for
 * the fixed bottom tab bars rendered inside pages.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <FadeIn className="flex flex-1 flex-col">{children}</FadeIn>;
}
