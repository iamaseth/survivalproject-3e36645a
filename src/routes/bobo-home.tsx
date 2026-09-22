import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/bobo-home")({
  component: BoboHome,
  head: () => ({
    meta: [
      { title: "BoBo Work · Survival Tabs" },
      { name: "description", content: "Simple work dashboard for BoBo." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const jobs = [
  {
    number: 1,
    title: "Survival Tabs Influencers",
    khmer: "ស្វែងរក TikTok Influencers",
    kind: "internal",
    href: "/bobo",
    button: "Start Influencer Research",
  },
  {
    number: 2,
    title: "Survival Tabs Content",
    khmer: "បង្កើត Content",
    kind: "external",
    href: "https://tabs-content-hub.lovable.app/",
    button: "Open Content Hub",
  },
  {
    number: 3,
    title: "Survival Tabs Book",
    khmer: "ធ្វើ Survival Tabs Book",
    kind: "external",
    href: "https://lovable.dev/projects/c35c3b62-8059-499d-bdaa-e3ea561a0db7",
    button: "Open Book Project",
  },
  {
    number: 4,
    title: "Survival Tabs Video",
    khmer: "បង្កើតវីដេអូ Survival Tabs",
    kind: "external",
    href: "https://drive.google.com/drive/u/0/folders/14AsRjn4B2nsVRd6Ym7NiU3I66INlJQlb",
    button: "Open Finished Video Folder",
    note: "After the video is approved, upload the final MP4 here so Seth and Rena can access it.",
    noteKhmer: "ពេលវីដេអូរួច និងបានអនុម័ត សូម Upload MP4 ចុងក្រោយនៅទីនេះ។",
  },
  {
    number: 5,
    title: "Deep Local Cambodia",
    khmer: "បង្កើតរឿង Deep Local",
    kind: "waiting",
    button: "Ask Seth for the approved link",
  },
] as const;

function BoboHome() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-4 pb-16">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">BoBo · Choose your work</h1>
        <p className="text-base text-muted-foreground">បូបូ · ជ្រើសរើសការងាររបស់អ្នក</p>
        <p className="text-sm">Click one button. Do one job at a time.</p>
        <p className="text-sm text-muted-foreground">ចុចប៊ូតុងមួយ។ ធ្វើការងារម្តងមួយ។</p>
      </header>

      <section className="space-y-3">
        {jobs.map((job) => (
          <article key={job.number} className="rounded-lg border p-4 space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{job.number} — {job.title}</h2>
              <p className="text-sm text-muted-foreground">{job.khmer}</p>
            </div>

            {"note" in job && job.note ? (
              <div className="rounded-md bg-secondary px-3 py-2 text-sm">
                <p>{job.note}</p>
                <p className="mt-1 text-muted-foreground">{job.noteKhmer}</p>
              </div>
            ) : null}

            {job.kind === "internal" ? (
              <Link
                to="/bobo"
                className="block w-full rounded-md bg-primary px-4 py-3 text-center text-base font-semibold text-primary-foreground"
              >
                {job.button} →
              </Link>
            ) : job.kind === "external" ? (
              <a
                href={job.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-md bg-primary px-4 py-3 text-center text-base font-semibold text-primary-foreground"
              >
                {job.button} ↗
              </a>
            ) : (
              <div className="w-full rounded-md bg-muted px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                {job.button}
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="rounded-lg border p-3 text-sm">
        <strong>Important / សំខាន់:</strong>
        <p className="mt-1">Use only the links on this page. Do not use old preview links.</p>
        <p className="text-muted-foreground">ប្រើតែ Link នៅលើទំព័រនេះ។ កុំប្រើ Link ចាស់។</p>
      </section>
    </main>
  );
}
