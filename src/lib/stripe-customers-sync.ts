import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { mapStripeSubscriptionStatus } from "@/lib/stripe-status";

type StripeSyncResult = {
  customersImported: number;
  subscriptionsImported: number;
  skippedCustomers: number;
  failedCustomers: number;
  archivedCustomers: number;
};

type LatestSubscription = {
  subscription: Stripe.Subscription;
  customer: Stripe.Customer;
};

export async function syncStripeCustomers(): Promise<StripeSyncResult> {
  const stripe = getStripe();
  let customersImported = 0;
  let subscriptionsImported = 0;
  let skippedCustomers = 0;
  let failedCustomers = 0;
  let archivedCustomers = 0;
  const currentStripeCustomerIds = new Set<string>();

  for await (const customer of listStripeCustomers(stripe)) {
    currentStripeCustomerIds.add(customer.id);

    if (!customer.email) {
      skippedCustomers += 1;
      await logSkippedStripeCustomer(customer.id, "Stripe customer has no email");
      continue;
    }

    try {
      await upsertCustomerFromStripeCustomer(customer);
      customersImported += 1;
    } catch (error) {
      failedCustomers += 1;
      await logFailedStripeCustomer(
        customer.id,
        "manual.customer_sync.customer_failed",
        error,
      );
    }
  }

  const subscriptionsByCustomer = new Map<string, LatestSubscription>();

  for await (const subscription of listStripeSubscriptions(stripe)) {
    const customer = getExpandedCustomer(subscription.customer);

    if (!customer || customer.deleted || !customer.email) {
      skippedCustomers += 1;
      await logSkippedStripeCustomer(
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
        `Subscription ${subscription.id} has no usable customer email`,
      );
      continue;
    }

    const existing = subscriptionsByCustomer.get(customer.id);

    if (!existing || subscription.created > existing.subscription.created) {
      subscriptionsByCustomer.set(customer.id, {
        subscription,
        customer,
      });
    }
  }

  for (const { subscription, customer } of subscriptionsByCustomer.values()) {
    try {
      await upsertCustomerFromStripeSubscription(customer, subscription);
      subscriptionsImported += 1;
    } catch (error) {
      failedCustomers += 1;
      await logFailedStripeCustomer(
        customer.id,
        "manual.customer_sync.subscription_failed",
        error,
        subscription.id,
      );
    }
  }

  archivedCustomers = await archiveCustomersMissingFromStripe(
    currentStripeCustomerIds,
  );

  await prisma.syncEvent.create({
    data: {
      provider: "stripe",
      eventType: "manual.customer_sync",
      status: failedCustomers > 0 ? "FAILED" : "SYNCED",
      payload: {
        customersImported,
        subscriptionsImported,
        skippedCustomers,
        failedCustomers,
        archivedCustomers,
      },
    },
  });

  return {
    customersImported,
    subscriptionsImported,
    skippedCustomers,
    failedCustomers,
    archivedCustomers,
  };
}

async function* listStripeCustomers(stripe: Stripe) {
  let startingAfter: string | undefined;

  do {
    const page = await stripe.customers.list({
      limit: 100,
      starting_after: startingAfter,
    });

    for (const customer of page.data) {
      yield customer;
    }

    startingAfter = page.has_more
      ? page.data[page.data.length - 1]?.id
      : undefined;
  } while (startingAfter);
}

async function* listStripeSubscriptions(stripe: Stripe) {
  let startingAfter: string | undefined;

  do {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      starting_after: startingAfter,
      expand: ["data.customer"],
    });

    for (const subscription of page.data) {
      yield subscription;
    }

    startingAfter = page.has_more
      ? page.data[page.data.length - 1]?.id
      : undefined;
  } while (startingAfter);
}

async function upsertCustomerFromStripeCustomer(customer: Stripe.Customer) {
  const email = customer.email?.toLowerCase();

  if (!email) {
    return;
  }

  await upsertCustomerFromStripeIdentity(customer.id, email, {
    customerSource: "STRIPE",
    companyName: customerCompanyName(customer),
    contactName: customer.name ?? null,
    phone: customer.phone ?? null,
  });
}

async function upsertCustomerFromStripeSubscription(
  customer: Stripe.Customer,
  subscription: Stripe.Subscription,
) {
  const email = customer.email?.toLowerCase();

  if (!email) {
    return;
  }

  await upsertCustomerFromStripeIdentity(customer.id, email, {
    customerSource: "STRIPE",
    companyName: customerCompanyName(customer),
    contactName: customer.name ?? null,
    phone: customer.phone ?? null,
    status: mapStripeSubscriptionStatus(subscription.status),
    plan: subscriptionPlan(subscription),
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscriptionPriceId(subscription),
    stripeProductId: subscriptionProductId(subscription),
    stripeCurrency: subscriptionCurrency(subscription),
    stripeInterval: subscriptionInterval(subscription),
    stripeIntervalCount: subscriptionIntervalCount(subscription),
    monthlyRevenueCents: subscriptionMonthlyRevenueCents(subscription),
    stripeCurrentPeriodEnd: subscriptionCurrentPeriodEnd(subscription),
  });
}

async function upsertCustomerFromStripeIdentity(
  stripeCustomerId: string,
  email: string,
  data: {
    customerSource: "STRIPE";
    companyName: string;
    contactName: string | null;
    phone: string | null;
    status?: ReturnType<typeof mapStripeSubscriptionStatus>;
    plan?: string | null;
    trialEndsAt?: Date | null;
    stripeSubscriptionId?: string;
    stripePriceId?: string | null;
    stripeProductId?: string | null;
    stripeCurrency?: string | null;
    stripeInterval?: string | null;
    stripeIntervalCount?: number | null;
    monthlyRevenueCents?: number;
    stripeCurrentPeriodEnd?: Date | null;
  },
) {
  const existingByStripeId = await prisma.customer.findUnique({
    where: { stripeCustomerId },
  });

  if (existingByStripeId) {
    await prisma.customer.update({
      where: { id: existingByStripeId.id },
      data: {
        ...data,
        email,
        stripeCustomerId,
      },
    });
    return;
  }

  await prisma.customer.upsert({
    where: { email },
    update: {
      ...data,
      stripeCustomerId,
    },
    create: {
      ...data,
      email,
      stripeCustomerId,
      status: data.status || "LEAD",
    },
  });
}

async function archiveCustomersMissingFromStripe(
  currentStripeCustomerIds: Set<string>,
) {
  const result = await prisma.customer.updateMany({
    where: {
      AND: [
        { stripeCustomerId: { not: null } },
        { stripeCustomerId: { notIn: Array.from(currentStripeCustomerIds) } },
        { status: { not: "ARCHIVED" } },
      ],
    },
    data: {
      status: "ARCHIVED",
    },
  });

  return result.count;
}

function getExpandedCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
) {
  if (
    typeof customer === "string" ||
    ("deleted" in customer && customer.deleted)
  ) {
    return null;
  }

  return customer;
}

function customerCompanyName(customer: Stripe.Customer) {
  return (
    customer.metadata.companyName ||
    customer.metadata.company ||
    customer.name ||
    customer.email?.split("@")[0] ||
    customer.id
  );
}

function subscriptionPlan(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price;

  return price?.lookup_key || price?.nickname || price?.id || null;
}

function subscriptionPriceId(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price.id || null;
}

function subscriptionProductId(subscription: Stripe.Subscription) {
  const product = subscription.items.data[0]?.price.product;

  if (!product) {
    return null;
  }

  return typeof product === "string" ? product : product.id;
}

function subscriptionCurrency(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price.currency?.toUpperCase() || null;
}

function subscriptionInterval(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price.recurring?.interval || null;
}

function subscriptionIntervalCount(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price.recurring?.interval_count || null;
}

function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const currentPeriodEnd = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;

  return currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
}

function subscriptionMonthlyRevenueCents(subscription: Stripe.Subscription) {
  if (subscription.status !== "active") {
    return 0;
  }

  return subscription.items.data.reduce((total, item) => {
    const unitAmount = item.price.unit_amount || 0;
    const quantity = item.quantity || 1;
    const interval = item.price.recurring?.interval;
    const intervalCount = item.price.recurring?.interval_count || 1;
    const recurringAmount = unitAmount * quantity;

    if (interval === "month") {
      return total + Math.round(recurringAmount / intervalCount);
    }

    if (interval === "year") {
      return total + Math.round(recurringAmount / (12 * intervalCount));
    }

    if (interval === "week") {
      return total + Math.round((recurringAmount * 52) / (12 * intervalCount));
    }

    if (interval === "day") {
      return total + Math.round((recurringAmount * 365) / (12 * intervalCount));
    }

    return total;
  }, 0);
}

async function logSkippedStripeCustomer(stripeCustomerId: string, error: string) {
  await prisma.syncEvent.create({
    data: {
      provider: "stripe",
      eventType: "manual.customer_sync.skipped",
      status: "FAILED",
      payload: { stripeCustomerId },
      error,
    },
  });
}

async function logFailedStripeCustomer(
  stripeCustomerId: string,
  eventType: string,
  error: unknown,
  stripeSubscriptionId?: string,
) {
  await prisma.syncEvent.create({
    data: {
      provider: "stripe",
      eventType,
      status: "FAILED",
      payload: {
        stripeCustomerId,
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      },
      error: errorToMessage(error),
    },
  });
}

function errorToMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
