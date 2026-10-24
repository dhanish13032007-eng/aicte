import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <section className="card w-full max-w-lg p-8 text-center">
        <FileQuestion className="mx-auto h-9 w-9 text-navy-600" aria-hidden />
        <h1 className="mt-4 text-h2 text-navy-700">Page not found</h1>
        <p className="mt-2 text-sm text-textmuted">
          The page you requested does not exist or is not available to your role.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">
            Go to overview
          </Link>
          <Link href="/" className="btn-secondary">
            Project home
          </Link>
        </div>
      </section>
    </div>
  );
}
