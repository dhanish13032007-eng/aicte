import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <section className="card w-full max-w-lg p-8 text-center">
        <ShieldAlert className="mx-auto h-9 w-9 text-danger" aria-hidden />
        <h1 className="mt-4 text-h2 text-navy-700">Access denied</h1>
        <p className="mt-2 text-sm text-textmuted">
          Your account does not have permission to view this page. Permissions are enforced on the server for every
          endpoint — contact an administrator if you believe this is incorrect.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="btn-primary">
            Go to overview
          </Link>
          <Link href="/login" className="btn-secondary">
            Switch account
          </Link>
        </div>
      </section>
    </div>
  );
}
