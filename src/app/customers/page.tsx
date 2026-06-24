import { revalidatePath } from "next/cache";
import { CustomerStatus, SyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  changeClimboClientStatus,
  compareCustomersWithClimbo,
} from "@/lib/climbo";
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

async function compareCustomersFromClimbo() {
  "use server";

  await compareCustomersWithClimbo();
  revalidatePath("/customers");
}

async function pauseCustomerInClimbo(formData: FormData) {
  "use server";

  await updateCustomerClimboStatus(formData, "paused");
  revalidatePath("/customers");
}

async function activateCustomerInClimbo(formData: FormData) {
  "use server";

  await updateCustomerClimboStatus(formData, "active");
  revalidatePath("/customers");
}

async function updateCustomerClimboStatus(
  formData: FormData,
  status: "active" | "paused",
) {
  const customerId = getRequiredString(formData, "customerId");
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer?.climboAccountId) {
    throw new Error("Customer does not have a Climbo account id yet");
  }

  const climboClient = await changeClimboClientStatus(
    customer.climboAccountId,
    status,
  );
  const now = new Date();

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      climboStatus: climboClient.status,
      climboIsActive: stripeIsActiveClimboStatus(climboClient.status),
      climboSyncStatus: "SYNCED",
      climboLastCheckedAt: now,
      climboLastSyncedAt: now,
    },
  });

  await prisma.syncEvent.create({
    data: {
      customerId: customer.id,
      provider: "climbo",
      eventType: `manual.change_status.${status}`,
      status: "SYNCED",
      payload: {
        climboClientId: customer.climboAccountId,
        requestedStatus: status,
        returnedStatus: climboClient.status,
      },
    },
  });
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = params?.view || "active";
  const where = customerWhere(view);

  const [
    customers,
    totalCustomers,
    trialCustomers,
    activeCustomers,
    failedSyncs,
    statusMismatches,
  ] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.customer.count(),
    prisma.customer.count({ where: { status: "TRIAL" } }),
    prisma.customer.count({ where: { status: "ACTIVE" } }),
    prisma.customer.count({ where: { climboSyncStatus: "FAILED" } }),
    prisma.customer.count({ where: mismatchWhere() }),
  ]);

  const metrics = [
    { label: "Clients", value: totalCustomers },
    { label: "Trials Stripe", value: trialCustomers },
    { label: "Clients actifs", value: activeCustomers },
    { label: "Alertes Climbo", value: statusMismatches + failedSyncs },
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
                Affichage par defaut des clients actifs et en trial.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterLink active={view === "active"} href="/customers">
                Actifs
              </FilterLink>
              <FilterLink active={view === "alerts"} href="/customers?view=alerts">
                Alertes
              </FilterLink>
              <FilterLink active={view === "all"} href="/customers?view=all">
                Tous
              </FilterLink>
              <form action={syncCustomersFromStripe}>
                <button className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                  Synchroniser Stripe
                </button>
              </form>
              <form action={compareCustomersFromClimbo}>
                <button className="h-10 rounded-md border border-cyan-700 px-4 text-sm font-semibold text-cyan-800 hover:bg-cyan-50">
                  Comparer Climbo
                </button>
              </form>
            </div>
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
                  <HeaderCell>Alerte</HeaderCell>
                  <HeaderCell>Action</HeaderCell>
                  <HeaderCell>Creation</HeaderCell>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {customers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
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
                        <ClimboBadge
                          isActive={customer.climboIsActive}
                          status={customer.climboStatus}
                          syncStatus={customer.climboSyncStatus}
                        />
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        {stripeLabel(customer.status, customer.stripeCustomerId)}
                      </td>
                      <td className="px-5 py-4">
                        <MismatchBadge
                          stripeIsActive={stripeIsActive(customer.status)}
                          climboIsActive={customer.climboIsActive}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <ClimboStatusAction
                          customerId={customer.id}
                          climboAccountId={customer.climboAccountId}
                          stripeIsActive={stripeIsActive(customer.status)}
                          climboIsActive={customer.climboIsActive}
                        />
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

function ClimboStatusAction({
  customerId,
  climboAccountId,
  stripeIsActive,
  climboIsActive,
}: {
  customerId: string;
  climboAccountId: string | null;
  stripeIsActive: boolean;
  climboIsActive: boolean | null;
}) {
  if (!climboAccountId) {
    return (
      <span className="text-xs font-medium text-slate-500">
        Comparer d'abord
      </span>
    );
  }

  if (!stripeIsActive && climboIsActive === true) {
    return (
      <form action={pauseCustomerInClimbo}>
        <input type="hidden" name="customerId" value={customerId} />
        <button className="h-9 rounded-md border border-amber-300 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50">
          Mettre en pause
        </button>
      </form>
    );
  }

  if (stripeIsActive && climboIsActive === false) {
    return (
      <form action={activateCustomerInClimbo}>
        <input type="hidden" name="customerId" value={customerId} />
        <button className="h-9 rounded-md border border-emerald-300 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
          Activer
        </button>
      </form>
    );
  }

  return <span className="text-xs font-medium text-slate-500">-</span>;
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

function FilterLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`inline-flex h-10 items-center rounded-md px-3 text-sm font-semibold ${
        active
          ? "bg-slate-950 text-white"
          : "border border-slate-300 text-slate-800 hover:bg-slate-50"
      }`}
    >
      {children}
    </a>
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

function ClimboBadge({
  isActive,
  status,
  syncStatus,
}: {
  isActive: boolean | null;
  status: string | null;
  syncStatus: SyncStatus;
}) {
  if (isActive === true) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        Climbo actif
      </span>
    );
  }

  if (isActive === false) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
        Climbo inactif
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
      {status || syncLabel(syncStatus)}
    </span>
  );
}

function MismatchBadge({
  stripeIsActive,
  climboIsActive,
}: {
  stripeIsActive: boolean;
  climboIsActive: boolean | null;
}) {
  if (climboIsActive === null) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
        Climbo inconnu
      </span>
    );
  }

  if (stripeIsActive !== climboIsActive) {
    return (
      <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
        Ecart
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
      OK
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

function customerWhere(view: string) {
  if (view === "all") {
    return {};
  }

  if (view === "alerts") {
    return mismatchWhere();
  }

  return {
    status: {
      in: ["ACTIVE", "TRIAL"] as CustomerStatus[],
    },
  };
}

function mismatchWhere() {
  return {
    OR: [
      {
        status: { in: ["ACTIVE", "TRIAL"] as CustomerStatus[] },
        OR: [{ climboIsActive: false }, { climboIsActive: null }],
      },
      {
        status: { notIn: ["ACTIVE", "TRIAL"] as CustomerStatus[] },
        climboIsActive: true,
      },
    ],
  };
}

function stripeIsActive(status: CustomerStatus) {
  return status === "ACTIVE" || status === "TRIAL";
}

function stripeIsActiveClimboStatus(status: string) {
  return status === "active" || status === "trialing";
}

function stripeLabel(status: CustomerStatus, stripeCustomerId: string | null) {
  if (!stripeCustomerId) {
    return "-";
  }

  return stripeIsActive(status) ? "Actif Stripe" : "Inactif Stripe";
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
