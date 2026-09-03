import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-border/60">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-xs text-muted-foreground">© {year} Kubb Portal</p>
        <nav className="flex items-center gap-4 text-xs">
          <Link
            href="/privacy"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
