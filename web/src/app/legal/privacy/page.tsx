import Link from "next/link";

export const metadata = { title: "Privacy Policy — Zero-10" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Zero-10
        </Link>
      </nav>
      <main className="mx-auto max-w-2xl px-6 py-12 prose prose-invert prose-zinc">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-zinc-400">Last updated: March 2026</p>

        <h2>1. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul>
          <li>
            <strong>Account information:</strong> Name, email address, and profile
            image from your OAuth provider (GitHub, Google)
          </li>
          <li>
            <strong>Project content:</strong> The .z10.html designs you create and
            store in the Service
          </li>
          <li>
            <strong>Usage data:</strong> MCP tool call counts, project counts, and
            storage usage for billing purposes
          </li>
          <li>
            <strong>Technical data:</strong> IP addresses, browser type, and server
            logs for security and debugging
          </li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the Service</li>
          <li>To process payments and manage subscriptions</li>
          <li>To enforce usage limits and prevent abuse</li>
          <li>To communicate with you about your account</li>
          <li>To improve the Service</li>
        </ul>

        <h2>3. Data Storage</h2>
        <p>
          Your project content is stored in PostgreSQL databases. We use
          industry-standard encryption for data in transit (TLS) and at rest.
          API keys are stored as SHA-256 hashes — we never store raw API keys.
        </p>

        <h2>4. Third-Party Services</h2>
        <p>We use the following third-party services:</p>
        <ul>
          <li>
            <strong>Stripe:</strong> Payment processing. See{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
              Stripe&apos;s Privacy Policy
            </a>
          </li>
          <li>
            <strong>OAuth providers:</strong> GitHub and Google for authentication
          </li>
        </ul>

        <h2>5. Data Sharing</h2>
        <p>
          We do not sell your personal information. We share data only with
          service providers necessary to operate the Service (payment processing,
          hosting) and when required by law.
        </p>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Delete your account and associated data</li>
          <li>Export your project content</li>
          <li>Opt out of non-essential communications</li>
        </ul>

        <h2>7. Cookies</h2>
        <p>
          We use essential cookies for authentication (session tokens). We do not
          use tracking cookies or third-party analytics cookies.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you
          of significant changes via email or in-app notification.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about this Privacy Policy, contact us at privacy@zero-10.dev.
        </p>
      </main>
    </div>
  );
}
