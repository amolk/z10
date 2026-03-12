import Link from "next/link";

export const metadata = { title: "Terms of Service — Zero-10" };

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Zero-10
        </Link>
      </nav>
      <main className="mx-auto max-w-2xl px-6 py-12 prose prose-invert prose-zinc">
        <h1>Terms of Service</h1>
        <p className="text-sm text-zinc-400">Last updated: March 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Zero-10 (&quot;the Service&quot;), you agree to be bound by
          these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Zero-10 is a visual editor that enables AI agents to build user interfaces
          via the Model Context Protocol (MCP). The Service includes a web editor,
          MCP server endpoints, code export tools, and related features.
        </p>

        <h2>3. Accounts</h2>
        <p>
          You must create an account to use the Service. You are responsible for
          maintaining the security of your account credentials and API keys. You are
          responsible for all activity that occurs under your account.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any illegal purpose</li>
          <li>Attempt to reverse engineer, decompile, or disassemble the Service</li>
          <li>Interfere with the proper working of the Service</li>
          <li>Exceed your plan&apos;s usage limits through automated means</li>
          <li>Share API keys or account credentials with unauthorized parties</li>
        </ul>

        <h2>5. Content Ownership</h2>
        <p>
          You retain all rights to the designs, code, and content you create using
          the Service. Zero-10 claims no ownership over your content.
        </p>

        <h2>6. Subscriptions and Billing</h2>
        <p>
          Paid plans are billed monthly or annually. You may cancel at any time.
          Refunds are provided on a case-by-case basis. Free tier usage is subject
          to the limits described in the pricing page.
        </p>

        <h2>7. Limitation of Liability</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. Zero-10
          shall not be liable for any indirect, incidental, or consequential damages
          arising from your use of the Service.
        </p>

        <h2>8. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Continued use of the Service
          after changes constitutes acceptance of the updated Terms.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about these Terms, contact us at legal@zero-10.dev.
        </p>
      </main>
    </div>
  );
}
