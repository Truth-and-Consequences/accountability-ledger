export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>

      <div className="prose prose-gray max-w-none">
        <p className="text-gray-600 mb-6">
          Last updated: January 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            1. Acceptance of Terms
          </h2>
          <p className="text-gray-700 mb-4">
            By accessing or using Accountability Ledger ("the Service"), you agree to be bound
            by these Terms of Service. If you do not agree to these terms, please do not use
            the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            2. Description of Service
          </h2>
          <p className="text-gray-700 mb-4">
            Accountability Ledger is a public database that aggregates and presents
            publicly available enforcement actions, regulatory filings, and official
            government records concerning corporate entities. All information is sourced
            from official government agencies and public records.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            3. Use of Information
          </h2>
          <p className="text-gray-700 mb-4">
            The information provided through the Service is for informational purposes only
            and should not be construed as legal, financial, or professional advice. Users
            should verify information independently and consult appropriate professionals
            before making decisions based on the information provided.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            4. Accuracy and Corrections
          </h2>
          <p className="text-gray-700 mb-4">
            While we strive to maintain accurate information sourced from official records,
            we cannot guarantee the completeness or accuracy of all data. If you believe
            any information is inaccurate, please submit a correction request through our
            Corrections page. We will review and address valid concerns promptly.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            5. Intellectual Property
          </h2>
          <p className="text-gray-700 mb-4">
            The underlying government documents and records referenced in our database are
            public domain. Our compilation, organization, analysis, and presentation of
            this information is protected by applicable intellectual property laws.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            6. Prohibited Uses
          </h2>
          <p className="text-gray-700 mb-4">
            You may not use the Service to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4">
            <li>Harass, threaten, or intimidate any individuals or entities</li>
            <li>Misrepresent information or create false or misleading content</li>
            <li>Interfere with the operation of the Service</li>
            <li>Attempt to gain unauthorized access to any systems</li>
            <li>Scrape or harvest data in violation of our robots.txt or rate limits</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            7. Disclaimer of Warranties
          </h2>
          <p className="text-gray-700 mb-4">
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
            OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE,
            OR FREE OF HARMFUL COMPONENTS.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            8. Limitation of Liability
          </h2>
          <p className="text-gray-700 mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF
            THE SERVICE.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            9. Changes to Terms
          </h2>
          <p className="text-gray-700 mb-4">
            We reserve the right to modify these Terms of Service at any time. Changes will
            be effective immediately upon posting. Your continued use of the Service after
            changes constitutes acceptance of the modified terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            10. Contact
          </h2>
          <p className="text-gray-700 mb-4">
            For questions about these Terms of Service, please contact us through our
            Corrections page.
          </p>
        </section>
      </div>
    </div>
  );
}
