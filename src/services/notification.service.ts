import nodemailer from "nodemailer";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

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

export async function sendPriceDropEmail(params: {
  notificationId: string;
  userId: string;
  trackedProductId: string;
  priceCents: number;
}): Promise<void> {
  const [user, product] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: params.userId } }),
    prisma.trackedProduct.findUniqueOrThrow({ where: { id: params.trackedProductId } }),
  ]);

  const priceLabel = (params.priceCents / 100).toFixed(2);

  await transport.sendMail({
    from: env.emailFrom,
    to: user.email,
    subject: `Preço caiu: ${product.name}`,
    text: `${product.name} está agora em R$ ${priceLabel} (meta: R$ ${(product.targetPriceCents / 100).toFixed(2)}).\n${product.url}`,
  });

  await prisma.notification.update({
    where: { id: params.notificationId },
    data: { status: "sent", sentAt: new Date() },
  });
}
