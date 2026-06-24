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
};

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

  await prisma.syncEvent.create({
    data: {
      provider: "climbo",
      eventType: "manual.customer_comparison",
      status: customersMissingInClimbo > 0 ? "FAILED" : "SYNCED",
      payload: {
        climboClientsChecked: climboClientsByEmail.size,
        customersMatched,
        customersMissingInClimbo,
      },
    },
  });

  return {
    climboClientsChecked: climboClientsByEmail.size,
    customersMatched,
    customersMissingInClimbo,
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

async function getClimboClientsByEmail() {
  const clients = new Map<string, ClimboClient>();
  let page = 1;
  let totalCount: number | null = null;

  do {
    const result = await listClimboClients(page);

    for (const client of result.clients || []) {
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
