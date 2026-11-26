import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const database = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Job = {
  id: number;
  attempts: number;
  endpoint: string;
  notification_id: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async request => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const token = request.headers.get("x-moh-push-token");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return new Response(null, { status: 401 });

  const { data, error } = await database.rpc("moh16_claim_web_push", { p_token: token });
  if (error) return new Response(null, { status: error.code === "42501" ? 401 : 503 });

  let sent = 0;
  const jobs: Job[] = data.jobs;
  for (let offset = 0; offset < jobs.length; offset += 10) {
    await Promise.all(jobs.slice(offset, offset + 10).map(async job => {
      let expired = false;
      try {
        await webpush.sendNotification({
          endpoint: job.endpoint,
          keys: { p256dh: job.p256dh, auth: job.auth },
        }, JSON.stringify({ id: job.notification_id }), {
          TTL: 86400,
          timeout: 5000,
          vapidDetails: {
            subject: "https://vraxisjk36.github.io/crc-moh-os/",
            publicKey: data.public_key,
            privateKey: data.private_key,
          },
        });
        sent++;
      } catch (failure) {
        const status = (failure as { statusCode?: number }).statusCode;
        expired = status === 404 || status === 410;
        if (!expired) {
          console.error("Delivery will retry", status ?? "transport failure");
          return;
        }
      }
      const result = await database.rpc("moh16_finish_web_push", {
        p_id: job.id, p_attempt: job.attempts, p_expired: expired,
      });
      if (result.error) console.error("Could not acknowledge delivery", result.error.code);
    }));
  }
  return Response.json({ claimed: jobs.length, sent });
});
