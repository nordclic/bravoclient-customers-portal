const metrics = [
  { label: "Clients", value: "0" },
  { label: "Trials Stripe", value: "0" },
  { label: "Synchros Climbo", value: "0" },
  { label: "Erreurs", value: "0" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-700">
          BravoClient
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Portail clients
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          Base indépendante pour suivre les clients, synchroniser Stripe et
          Climbo, puis préparer la migration vers un système propriétaire.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-slate-500">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {metric.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Prochaines connexions
          </h2>
          <div className="mt-4 divide-y divide-slate-100 text-sm">
            {["PostgreSQL + Prisma", "Stripe webhooks", "API Climbo"].map(
              (item) => (
                <div
                  key={item}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="text-slate-700">{item}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                    A configurer
                  </span>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Architecture cible
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            L’application garde ta base clients comme source de vérité. Stripe
            déclenche les changements d’abonnement, puis Climbo est synchronisé
            comme service externe jusqu’à son remplacement progressif.
          </p>
        </div>
      </section>
    </main>
  );
}
