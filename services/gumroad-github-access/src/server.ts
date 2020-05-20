import { Application, Router, Request, Response } from "../deps.ts";
import {
  GITHUB_API_BASE_URL,
  GITHUB_API_TEAM_MEMBERSHIP_BASE_URL,
} from "./config.ts";

// See https://gumroad.com/ping
interface IGumroadWebhookPayload {
  affiliate_credit_amount_cents?: number;
  affiliate?: string;
  custom_fields?: any;
  email: string;
  full_name?: string;
  gift_price?: number;
  gifter_email?: string;
  ip_country?: string;
  is_gift_receiver_purchase?: boolean;
  is_preorder_authorization?: boolean;
  is_recurring_charge?: boolean;
  license_key?: string;
  offer_code?: string;
  order_number?: string;
  price?: number;
  product_id?: string;
  product_permalink?: string;
  purchaser_id?: string;
  quantity?: number;
  recurrence?: string;
  refunded?: boolean;
  sale_id?: string;
  sale_timestamp?: string;
  seller_id?: string;
  shipping_information?: any;
  shipping_rate?: number;
  subscription_id?: string;
  test?: boolean;
  url_params?: any;
  variants?: any;
}

const convertFormPayloadToJson = (
  formValues: URLSearchParams
): IGumroadWebhookPayload => ({
  email: formValues.get("email") || "",
  refunded: formValues.get("refunded") === "true",
  seller_id: formValues.get("seller_id") || "",
});

/**
 * @param email The Gumroad buyer's email address.
 * @see https://developer.github.com/v3/search/#search-users
 */
const findGitHubUserByEmail = async (email: string) => {
  console.log(`Finding GitHub username for email: ${email}`);
  const res = await fetch(`${GITHUB_API_BASE_URL}/search/users?q=${email}`, {
    headers: {
      Accept: "application/vnd.github.v3.text-match+json",
    },
  });
  const data = await res.json();
  const user = data.items.find((item: any) =>
    item.text_matches.find(
      (match: any) => match.property === "email" && match.fragment === email
    )
  );
  return user ? user.login : null;
};

const addToGitHubTeam = async (gitHubUsername: string) => {
  const res = await fetch(
    `${GITHUB_API_TEAM_MEMBERSHIP_BASE_URL}/${gitHubUsername}`,
    {
      headers: {
        Authorization: `Token ${Deno.env.get("GITHUB_TOKEN")}`,
      },
      method: "PUT",
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Could not add GitHub user "${gitHubUsername}" to team due to: ${JSON.stringify(
        data
      )}`
    );
  }
};

const removeFromGitHubTeam = async (gitHubUsername: string) => {
  const res = await fetch(
    `${GITHUB_API_TEAM_MEMBERSHIP_BASE_URL}/${gitHubUsername}`,
    {
      headers: {
        Authorization: `Token ${Deno.env.get("GITHUB_TOKEN")}`,
      },
      method: "DELETE",
    }
  );
  if (res.status !== 204) {
    throw new Error(
      `Could not remove GitHub user "${gitHubUsername}" from team.`
    );
  }
};

const isBadRequest = (seller_id: string = "") =>
  seller_id.length === 0 || seller_id !== Deno.env.get("GUMROAD_SELLER_ID");

const processWebhook = async ({
  request,
  response,
}: {
  request: Request;
  response: Response;
}) => {
  try {
    if (request.hasBody) {
      const body = await request.body();
      console.log("Gumroad payload string:", body.value.toString());

      const webhookPayload = convertFormPayloadToJson(body.value);
      console.log("Gumroad payload JSON:", JSON.stringify(webhookPayload));

      if (isBadRequest(webhookPayload.seller_id)) {
        throw new Error(
          `Bad actors at play. Request payload: ${body.value.toString()}; Request headers: ${Array.from(
            request.headers.entries()
          )
            .map((entry) => `${entry[0]}: ${entry[1]}`)
            .join(", ")}`
        );
      }

      const gitHubUsername = await findGitHubUserByEmail(webhookPayload.email);
      console.log("GitHub username:", gitHubUsername);

      if (!gitHubUsername) {
        throw new Error(
          `GitHub user for email "${webhookPayload.email}" could not be found.`
        );
      }

      if (webhookPayload.refunded) {
        await removeFromGitHubTeam(gitHubUsername);
        console.log(
          `User with email "${webhookPayload.email}" and GitHub username "${gitHubUsername}" removed from the GitHub team.`
        );
      } else {
        await addToGitHubTeam(gitHubUsername);
        console.log(
          `User with email "${webhookPayload.email}" and GitHub username "${gitHubUsername}" added to the GitHub team.`
        );
      }
    }
  } catch (error) {
    console.error(new Error(error.message));
  } finally {
    // Anything other than 200 forces Gumroad to retry. No need to retry.
    // The most likely cause for an error is when the user's Gumroad email
    // doesn't match their GitHub email. In that case, Mike will manually
    // reach out to the buyer to give them access.
    response.status = 200;
  }
};

const router = new Router();
router.post("/", processWebhook);

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

const port = +(Deno.env.get("PORT") || 8000);
console.log(`Server listening on port ${port}...`);
await app.listen({ port });
