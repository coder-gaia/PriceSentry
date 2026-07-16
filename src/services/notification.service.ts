import nodemailer from "nodemailer";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { formatCentsForMessage } from "../lib/formatCurrency";
import { sendBreachWebhook, type WebhookType } from "./webhook.service";

function buildTransport() {
  if (!env.smtpHost) {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
}

const transport = buildTransport();

async function sendPriceDropEmail(params: {
  userEmail: string;
  productName: string;
  productUrl: string;
  priceCents: number;
  targetPriceCents: number;
  currency: string;
}): Promise<void> {
  const price = formatCentsForMessage(params.priceCents, params.currency);
  const target = formatCentsForMessage(params.targetPriceCents, params.currency);

  await transport.sendMail({
    from: env.emailFrom,
    to: params.userEmail,
    subject: `Preço caiu: ${params.productName}`,
    text: `${params.productName} está agora em ${price} (meta: ${target}).\n${params.productUrl}`,
  });
}

export async function sendPriceDropNotifications(params: {
  notificationId: string;
  userId: string;
  trackedProductId: string;
  priceCents: number;
}): Promise<void> {
  const [user, product] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: params.userId } }),
    prisma.trackedProduct.findUniqueOrThrow({ where: { id: params.trackedProductId } }),
  ]);

  await sendPriceDropEmail({
    userEmail: user.email,
    productName: product.name,
    productUrl: product.url,
    priceCents: params.priceCents,
    targetPriceCents: product.targetPriceCents,
    currency: product.currency,
  });

  if (user.webhookUrl && user.webhookType) {
    await sendBreachWebhook({
      webhookUrl: user.webhookUrl,
      webhookType: user.webhookType as WebhookType,
      productName: product.name,
      productUrl: product.url,
      priceCents: params.priceCents,
      targetPriceCents: product.targetPriceCents,
      currency: product.currency,
    });
  }

  await prisma.notification.update({
    where: { id: params.notificationId },
    data: { status: "sent", sentAt: new Date() },
  });
}