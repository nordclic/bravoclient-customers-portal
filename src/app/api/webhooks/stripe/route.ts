import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { upsertClimboAccount } from "@/lib/climbo";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { mapStripeSubscriptionStatus } from "@/lib/stripe-status";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = (await headers()).get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await prisma.syncEvent.create({
    data: {
      provider: "stripe",
      eventType: event.type,
      status: "PENDING",
      payload: event as unknown as object,
    },
  });

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await handleSubscriptionEvent(stripe, event.data.object);
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionEvent(
  stripe: Stripe,
  subscription: Stripe.Subscription,
) {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const stripeCustomer = await stripe.customers.retrieve(stripeCustomerId);

  if (stripeCustomer.deleted) {
    return;
  }

  const email = stripeCustomer.email;

  if (!email) {
    throw new Error(`Stripe customer ${stripeCustomerId} does not have an email`);
  }

  const companyName =
    stripeCustomer.metadata.companyName ||
    stripeCustomer.name ||
    email.split("@")[0];
  const mappedStatus = mapStripeSubscriptionStatus(subscription.status);

  const customer = await prisma.customer.upsert({
    where: { email },
    update: {
      companyName,
      contactName: stripeCustomer.name,
      phone: stripeCustomer.phone,
      status: mappedStatus,
      plan: subscription.items.data[0]?.price.lookup_key,
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
    },
    create: {
      companyName,
      contactName: stripeCustomer.name,
      email,
      phone: stripeCustomer.phone,
      status: mappedStatus,
      plan: subscription.items.data[0]?.price.lookup_key,
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
    },
  });

  if (mappedStatus !== "ACTIVE" && mappedStatus !== "TRIAL") {
    return;
  }

  try {
    const climboAccount = await upsertClimboAccount({
      companyName: customer.companyName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      plan: customer.plan,
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        climboAccountId: climboAccount.accountId,
        climboSyncStatus: "SYNCED",
        climboLastSyncedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        climboSyncStatus: "FAILED",
      },
    });

    throw error;
  }
}
