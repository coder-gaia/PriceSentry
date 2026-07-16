import axios from "axios";
import { formatCentsForMessage } from "../lib/formatCurrency";

export type WebhookType = "slack" | "discord";

type BreachWebhookParams = {
  webhookUrl: string;
  webhookType: WebhookType;
  productName: string;
  productUrl: string;
  priceCents: number;
  targetPriceCents: number;
  currency: string;
};

const BREACH_COLOR = 0xff2e6c;

function buildSlackPayload(params: BreachWebhookParams) {
  const price = formatCentsForMessage(params.priceCents, params.currency);
  const target = formatCentsForMessage(params.targetPriceCents, params.currency);
  return {
    text: `Breach detectado: ${params.productName} caiu para ${price} (alvo: ${target})`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:small_red_triangle_down: *Breach detectado*\n*<${params.productUrl}|${params.productName}>* caiu para *${price}* (alvo: ${target})`,
        },
      },
    ],
  };
}

function buildDiscordPayload(params: BreachWebhookParams) {
  const price = formatCentsForMessage(params.priceCents, params.currency);
  const target = formatCentsForMessage(params.targetPriceCents, params.currency);
  return {
    embeds: [
      {
        title: "Breach detectado",
        description: `**${params.productName}** caiu para **${price}** (alvo: ${target})`,
        url: params.productUrl,
        color: BREACH_COLOR,
      },
    ],
  };
}

export async function sendBreachWebhook(params: BreachWebhookParams): Promise<void> {
  const payload =
    params.webhookType === "slack" ? buildSlackPayload(params) : buildDiscordPayload(params);
  await axios.post(params.webhookUrl, payload, { timeout: 10_000 });
}