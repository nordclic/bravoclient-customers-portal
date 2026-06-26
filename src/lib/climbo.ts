import { prisma } from "@/lib/prisma";

type UpsertClimboAccountInput = {
  companyName: string;
  contactName?: string | null;
  email: string;
  phone?: string | null;
  plan?: string | null;
};

type ClimboAccountResult = {
  accountId: string;
};

type ClimboClient = {
  id: string;
  business_name: string;
  location_count: number;
  user_name: string;
  plan_id: string;
  email: string;
  source: "climbo" | "stripe";
  status:
    | "all"
    | "ended"
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "active"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "paused";
  login_link?: string | null;
  created_at: string;
};

type ClimboClientsList = {
  clients?: ClimboClient[];
  total_count?: number | null;
};

type ClimboComparisonResult = {
  climboClientsChecked: number;
  customersMatched: number;
  customersMissingInClimbo: number;
  ambassadorsImported: number;
  ambassadorImportErrors: number;
  climboClientsSkipped: number;
};

type ChangeClimboClientStatus = "active" | "trialing" | "unpaid" | "paused";

const activeClimboStatuses = new Set(["active", "trialing"]);

export async function compareCustomersWithClimbo(): Promise<ClimboComparisonResult> {
  const climboClientsByEmail = await getClimboClientsByEmail();
  const customers = await prisma.customer.findMany({
    where: {
      stripeCustomerId: { not: null },
    },
  });
  const checkedAt = new Date();
  let customersMatched = 0;
  let customersMissingInClimbo = 0;
  let ambassadorsImported = 0;
  let ambassadorImportErrors = 0;
  let climboClientsSkipped = 0;

  for (const customer of customers) {
    const climboClient = climboClientsByEmail.get(customer.email.toLowerCase());

    if (!climboClient) {
      customersMissingInClimbo += 1;

      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          climboIsActive: false,
          climboStatus: "missing",
          climboSyncStatus: "FAILED",
          climboLastCheckedAt: checkedAt,
        },
      });

      continue;
    }

    customersMatched += 1;

    await releaseClimboAccountFromOtherCustomers(customer.id, climboClient.id);

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        climboAccountId: climboClient.id,
        climboIsActive: activeClimboStatuses.has(climboClient.status),
        climboStatus: climboClient.status,
        climboSyncStatus: "SYNCED",
        climboLastCheckedAt: checkedAt,
        climboLastSyncedAt: checkedAt,
      },
    });
  }

  const ambassadorImport = await upsertAmbassadorCustomersFromClimbo(
    Array.from(climboClientsByEmail.values()),
    checkedAt,
  );
  ambassadorsImported = ambassadorImport.imported;
  ambassadorImportErrors = ambassadorImport.errors;
  climboClientsSkipped = ambassadorImport.skipped;

  await prisma.syncEvent.create({
    data: {
      provider: "climbo",
      eventType: "manual.customer_comparison",
      status: ambassadorImportErrors > 0 ? "FAILED" : "SYNCED",
      payload: {
        climboClientsChecked: climboClientsByEmail.size,
        customersMatched,
        customersMissingInClimbo,
        ambassadorsImported,
        ambassadorImportErrors,
        climboClientsSkipped,
      },
    },
  });

  return {
    climboClientsChecked: climboClientsByEmail.size,
    customersMatched,
    customersMissingInClimbo,
    ambassadorsImported,
    ambassadorImportErrors,
    climboClientsSkipped,
  };
}

export async function upsertClimboAccount(
  input: UpsertClimboAccountInput,
): Promise<ClimboAccountResult> {
  const baseUrl = process.env.CLIMBO_API_BASE_URL;
  const apiKey = process.env.CLIMBO_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("Climbo API is not configured");
  }

  const response = await fetch(`${baseUrl}/accounts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Climbo account sync failed: ${response.status} ${details}`);
  }

  const data = (await response.json()) as Partial<ClimboAccountResult>;

  if (!data.accountId) {
    throw new Error("Climbo response did not include accountId");
  }

  return { accountId: data.accountId };
}

export async function changeClimboClientStatus(
  clientId: string,
  status: ChangeClimboClientStatus,
) {
  const baseUrl = process.env.CLIMBO_API_BASE_URL || "https://api.climbo.com";
  const apiKey = process.env.CLIMBO_API_KEY;

  if (!apiKey) {
    throw new Error("CLIMBO_API_KEY is not configured");
  }

  const url = new URL(`${baseUrl}/client/${clientId}/change-status`);
  url.searchParams.set("status", status);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Climbo status change failed: ${response.status} ${details}`,
    );
  }

  return (await response.json()) as ClimboClient;
}

async function upsertAmbassadorCustomersFromClimbo(
  climboClients: ClimboClient[],
  checkedAt: Date,
) {
  let ambassadorsImported = 0;
  let ambassadorImportErrors = 0;
  let climboClientsSkipped = 0;

  for (const climboClient of climboClients) {
    if (!climboClient.email) {
      climboClientsSkipped += 1;
      continue;
    }

    if (!isAmbassadorClient(climboClient)) {
      continue;
    }

    try {
      const email = climboClient.email.toLowerCase();
      const existingCustomerByClimboId = await prisma.customer.findUnique({
        where: { climboAccountId: climboClient.id },
      });

      if (existingCustomerByClimboId?.stripeCustomerId) {
        continue;
      }

      const existingStripeCustomer = await prisma.customer.findFirst({
        where: {
          email,
          stripeCustomerId: { not: null },
        },
      });

      if (existingStripeCustomer) {
        continue;
      }

      const data = ambassadorCustomerData(climboClient, checkedAt);

      if (existingCustomerByClimboId) {
        await prisma.customer.update({
          where: { id: existingCustomerByClimboId.id },
          data: {
            ...data,
            email,
          },
        });
      } else {
        await prisma.customer.upsert({
          where: { email },
          update: data,
          create: {
            ...data,
            email,
          },
        });
      }

      ambassadorsImported += 1;
    } catch (error) {
      ambassadorImportErrors += 1;
      await prisma.syncEvent.create({
        data: {
          provider: "climbo",
          eventType: "manual.ambassador_import_failed",
          status: "FAILED",
          payload: {
            climboClientId: climboClient.id,
            email: climboClient.email,
            planId: climboClient.plan_id,
          },
          error: errorToMessage(error),
        },
      });
    }
  }

  return {
    imported: ambassadorsImported,
    errors: ambassadorImportErrors,
    skipped: climboClientsSkipped,
  };
}

async function releaseClimboAccountFromOtherCustomers(
  customerId: string,
  climboAccountId: string,
) {
  await prisma.customer.updateMany({
    where: {
      id: { not: customerId },
      climboAccountId,
    },
    data: {
      climboAccountId: null,
      climboIsActive: null,
      climboStatus: null,
      climboSyncStatus: "PENDING",
    },
  });
}

function ambassadorCustomerData(climboClient: ClimboClient, checkedAt: Date) {
  return {
    customerSource: "AMBASSADOR" as const,
    companyName: climboClient.business_name,
    contactName: climboClient.user_name,
    plan: climboClient.plan_id,
    status: activeClimboStatuses.has(climboClient.status)
      ? ("ACTIVE" as const)
      : ("LEAD" as const),
    climboAccountId: climboClient.id,
    climboIsActive: activeClimboStatuses.has(climboClient.status),
    climboStatus: climboClient.status,
    climboSyncStatus: "SYNCED" as const,
    climboLastCheckedAt: checkedAt,
    climboLastSyncedAt: checkedAt,
  };
}

function isAmbassadorClient(climboClient: ClimboClient) {
  const configuredPlanIds = (process.env.CLIMBO_AMBASSADOR_PLAN_IDS || "")
    .split(",")
    .map((planId) => planId.trim().toLowerCase())
    .filter(Boolean);
  const planId = (climboClient.plan_id || "").toLowerCase();

  return (
    climboClient.source === "climbo" ||
    configuredPlanIds.includes(planId) ||
    planId.includes("ambassador") ||
    planId.includes("ambassadeur")
  );
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function getClimboClientsByEmail() {
  const clients = new Map<string, ClimboClient>();
  let page = 1;
  let totalCount: number | null = null;

  do {
    const result = await listClimboClients(page);

    for (const client of result.clients || []) {
      if (!client.email) {
        continue;
      }

      clients.set(client.email.toLowerCase(), client);
    }

    totalCount = result.total_count ?? totalCount;

    if (!result.clients?.length) {
      break;
    }

    page += 1;
  } while (totalCount === null || clients.size < totalCount);

  return clients;
}

async function listClimboClients(page: number) {
  const baseUrl = process.env.CLIMBO_API_BASE_URL || "https://api.climbo.com";
  const apiKey = process.env.CLIMBO_API_KEY;

  if (!apiKey) {
    throw new Error("CLIMBO_API_KEY is not configured");
  }

  const url = new URL(`${baseUrl}/clients`);
  url.searchParams.set("page", page.toString());

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Climbo clients fetch failed: ${response.status} ${details}`);
  }

  return (await response.json()) as ClimboClientsList;
}
