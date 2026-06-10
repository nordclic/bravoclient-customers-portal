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
