import { revalidatePath } from "next/cache";
import { CustomerStatus, SyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncStripeCustomers } from "@/lib/stripe-customers-sync";

export const dynamic = "force-dynamic";

const customerStatuses: CustomerStatus[] = [
  "LEAD",
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "ARCHIVED",
];

async function createCustomer(formData: FormData) {
  "use server";

  const companyName = getRequiredString(formData, "companyName");
  const email = getRequiredString(formData, "email").toLowerCase();
  const contactName = getOptionalString(formData, "contactName");
  const phone = getOptionalString(formData, "phone");
  const plan = getOptionalString(formData, "plan");
  const notes = getOptionalString(formData, "notes");
  const status = getStatus(formData.get("status"));
  const trialEndsAt = getOptionalDate(formData, "trialEndsAt");

  await prisma.customer.upsert({
    where: { email },
    update: {
      companyName,
      contactName,
      phone,
      status,
      plan,
      trialEndsAt,
      notes,
    },
    create: {
      companyName,
      contactName,
      email,
      phone,
      status,
      plan,
      trialEndsAt,
      notes,
    },
  });

  revalidatePath("/customers");
}

async function syncCustomersFromStripe() {
  "use server";

  await syncStripeCustomers();
  revalidatePath("/customers");
}

export default async function CustomersPage() {
  const [customers, totalCustomers, trialCustomers, activeCustomers, failedSyncs] =
    await Promise.all([
      prisma.customer.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.customer.count(),
      prisma.customer.count({ where: { status: "TRIAL" } }),
      prisma.customer.count({ where: { status: "ACTIVE" } }),
      prisma.customer.count({ where: { climboSyncStatus: "FAILED" } }),
    ]);

  const metrics = [
    { label: "Clients", value: totalCustomers },
    { label: "Trials Stripe", value: trialCustomers },
    { label: "Clients actifs", value: activeCustomers },
    { label: "Erreurs Climbo", value: failedSyncs },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-7">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-5">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-700">
          BravoClient
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Gestion clients
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Ajoute tes clients dans ta base independante, suis leur statut Stripe
          et prepare la synchronisation Climbo depuis un seul endroit.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
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

      <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <form
          action={createCustomer}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-slate-950">
              Ajouter un client
            </h2>
            <p className="text-sm text-slate-500">
              L email sert de cle unique. Si le client existe deja, sa fiche est
              mise a jour.
            </p>
          </div>

          <div className="mt-5 grid gap-4">
            <Field label="Societe" name="companyName" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Contact" name="contactName" />
            <Field label="Telephone" name="phone" />
            <Field label="Plan" name="plan" placeholder="starter, pro..." />

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Statut</span>
              <select
                name="status"
                defaultValue="LEAD"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-cyan-600"
              >
                {customerStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <Field label="Fin de trial" name="trialEndsAt" type="date" />

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea
                name="notes"
                rows={4}
                className="rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-cyan-600"
              />
            </label>

            <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              Enregistrer
            </button>
          </div>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Clients en base
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Les 50 fiches les plus recentes.
              </p>
            </div>
            <form action={syncCustomersFromStripe}>
              <button className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                Synchroniser Stripe
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <HeaderCell>Client</HeaderCell>
                  <HeaderCell>Statut</HeaderCell>
                  <HeaderCell>Plan</HeaderCell>
                  <HeaderCell>Climbo</HeaderCell>
                  <HeaderCell>Stripe</HeaderCell>
                  <HeaderCell>Creation</HeaderCell>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {customers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-10 text-center text-slate-500"
                    >
                      Aucun client pour le moment.
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-950">
                          {customer.companyName}
                        </div>
                        <div className="mt-1 text-slate-500">
                          {customer.email}
                        </div>
                        {customer.contactName ? (
                          <div className="mt-1 text-slate-500">
                            {customer.contactName}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={customer.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {customer.plan || "-"}
                      </td>
                      <td className="px-5 py-4">
                        <SyncBadge status={customer.climboSyncStatus} />
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {customer.stripeCustomerId ? "Connecte" : "-"}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {formatDate(customer.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="h-10 rounded-md border border-slate-300 px-3 text-slate-950 outline-none focus:border-cyan-600"
      />
    </label>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">
      {children}
    </th>
  );
}

function StatusBadge({ status }: { status: CustomerStatus }) {
  const styles: Record<CustomerStatus, string> = {
    LEAD: "bg-slate-100 text-slate-700",
    TRIAL: "bg-cyan-50 text-cyan-700",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAST_DUE: "bg-amber-50 text-amber-700",
    CANCELED: "bg-rose-50 text-rose-700",
    ARCHIVED: "bg-zinc-100 text-zinc-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const styles: Record<SyncStatus, string> = {
    PENDING: "bg-amber-50 text-amber-700",
    SYNCED: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles[status]}`}
    >
      {syncLabel(status)}
    </span>
  );
}

function statusLabel(status: CustomerStatus) {
  const labels: Record<CustomerStatus, string> = {
    LEAD: "Prospect",
    TRIAL: "Trial",
    ACTIVE: "Actif",
    PAST_DUE: "Paiement en retard",
    CANCELED: "Annule",
    ARCHIVED: "Archive",
  };

  return labels[status];
}

function syncLabel(status: SyncStatus) {
  const labels: Record<SyncStatus, string> = {
    PENDING: "En attente",
    SYNCED: "Synchronise",
    FAILED: "Erreur",
  };

  return labels[status];
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getRequiredString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function getStatus(value: FormDataEntryValue | null): CustomerStatus {
  if (
    typeof value === "string" &&
    customerStatuses.includes(value as CustomerStatus)
  ) {
    return value as CustomerStatus;
  }

  return "LEAD";
}

function getOptionalDate(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return new Date(`${value}T00:00:00.000Z`);
}
