export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>

      <div className="prose prose-gray max-w-none">
        <p className="text-gray-600 mb-6">
          Last updated: January 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Our Commitment to Privacy
          </h2>
          <p className="text-gray-700 mb-4">
            Accountability Ledger is committed to protecting your privacy. This policy
            explains what information we collect, how we use it, and your rights regarding
            your data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Information We Collect
          </h2>

          <h3 className="text-lg font-medium text-gray-800 mb-2">
            Information You Provide
          </h3>
          <p className="text-gray-700 mb-4">
            We may collect information you voluntarily provide, such as:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>Correction requests submitted through our Corrections page</li>
            <li>Contact information if you reach out to us</li>
          </ul>

          <h3 className="text-lg font-medium text-gray-800 mb-2">
            Automatically Collected Information
          </h3>
          <p className="text-gray-700 mb-4">
            When you visit our site, we automatically collect:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>IP address (for security and rate limiting purposes)</li>
            <li>Browser type and version</li>
            <li>Pages visited and time spent</li>
            <li>Referring website</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            How We Use Information
          </h2>
          <p className="text-gray-700 mb-4">
            We use collected information to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>Operate and maintain the Service</li>
            <li>Process correction requests</li>
            <li>Protect against abuse and unauthorized access</li>
            <li>Analyze usage patterns to improve the Service</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Information About Entities in Our Database
          </h2>
          <p className="text-gray-700 mb-4">
            Our database contains information about <strong>corporate entities and their
            official actions</strong>, not private individuals. We only publish:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>Information from official government sources</li>
            <li>Publicly filed documents and records</li>
            <li>Official enforcement actions and regulatory filings</li>
          </ul>
          <p className="text-gray-700 mb-4">
            We do not collect or publish personal information about private individuals
            unless they are named in official public records in their capacity as corporate
            officers or representatives.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Data Sharing
          </h2>
          <p className="text-gray-700 mb-4">
            We do not sell your personal information. We may share information with:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>Service providers who assist in operating the Service</li>
            <li>Law enforcement when required by law</li>
            <li>Other parties with your consent</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Cookies and Tracking
          </h2>
          <p className="text-gray-700 mb-4">
            We use essential cookies for authentication and security purposes. We do not
            use third-party advertising cookies or cross-site tracking.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Data Retention
          </h2>
          <p className="text-gray-700 mb-4">
            We retain server logs for security purposes for up to 90 days. Correction
            requests and related correspondence are retained as part of our audit trail.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Your Rights
          </h2>
          <p className="text-gray-700 mb-4">
            Depending on your jurisdiction, you may have the right to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your personal information</li>
            <li>Object to processing of your information</li>
          </ul>
          <p className="text-gray-700 mb-4">
            To exercise these rights, please contact us through our Corrections page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Security
          </h2>
          <p className="text-gray-700 mb-4">
            We implement appropriate technical and organizational measures to protect
            your information, including encryption in transit and at rest, access controls,
            and regular security assessments.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Changes to This Policy
          </h2>
          <p className="text-gray-700 mb-4">
            We may update this Privacy Policy from time to time. We will notify you of
            material changes by posting the updated policy with a new effective date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            Contact Us
          </h2>
          <p className="text-gray-700 mb-4">
            For questions about this Privacy Policy or our data practices, please
            contact us through our Corrections page.
          </p>
        </section>
      </div>
    </div>
  );
}
