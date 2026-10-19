import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/influencer-review")({
  head: () => ({ meta: [{ title: "Influencer Review — Survival Tabs" }, { name: "robots", content: "noindex" }] }),
  component: InfluencerReview,
});

function InfluencerReview() {
  // Apps Script hosts the protected UI; do not put access tokens or influencer records in browser code.
  const url = "https://script.google.com/macros/s/AKfycby_MjjXYWEHiC41tSYHTcfPWOwxuE_A7AbB2XniUsyMAXxq_f9d3mWvCj2l_eNNA0jL/exec";
  return (
    <main className="min-h-screen bg-[#f4f7f4] text-[#173c2c]">
      <div className="bg-white px-5 py-2 text-sm"><a className="underline" href={url} target="_blank" rel="noopener noreferrer">Open secure Google Sheets review directly ↗</a></div>
      <header className="border-b border-[#dce5dd] bg-white px-5 py-4">
        <h1 className="text-xl font-semibold">Survival Tabs · Influencer Review</h1>
        <p className="text-sm text-[#53685a]">Google Sheets workflow · Rena's queue remains separate</p>
      </header>
      {url?.startsWith("https://script.google.com/macros/s/") ? (
        <iframe title="Influencer Review" src={url} className="h-[calc(100vh-90px)] w-full border-0" referrerPolicy="no-referrer" />
      ) : (
        <section className="mx-auto mt-12 max-w-xl rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Google Sheets connection not configured</h2>
          <p className="mt-2">Deploy the accompanying Google Apps Script web app and set VITE_INFLUENCER_REVIEW_WEB_APP_URL to its /exec URL. No data has been modified.</p>
        </section>
      )}
    </main>
  );
}
