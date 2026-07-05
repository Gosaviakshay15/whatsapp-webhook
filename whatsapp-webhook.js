const express = require("express");
const https = require("https");
const app = express();
app.use(express.json());

const {
    VERIFY_TOKEN,
    ACCESS_TOKEN,
    PHONE_NUMBER_ID,
    TEMPLATE_NAME,
    TEMPLATE_LANG = "en_US",
    PORT = 3000,
} = process.env;

const seen = new Set();

app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

          if (mode === "subscribe" && token === VERIFY_TOKEN) {
                return res.status(200).send(challenge);
          }
    res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
    res.sendStatus(200);
    try {
          const value = req.body?.entry?.[0]?.changes?.[0]?.value;
          const msg = value?.messages?.[0];
          if (!msg) return;
          if (seen.has(msg.id)) return;
          seen.add(msg.id);
          sendTemplate(msg.from);
    } catch (e) {
          console.error("handler error:", e);
    }
});

function sendTemplate(to) {
    const payload = JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
                  name: TEMPLATE_NAME,
                  language: { code: TEMPLATE_LANG },
          },
    });

  const options = {
        hostname: "graph.facebook.com",
        path: `/v20.0/${PHONE_NUMBER_ID}/messages`,
        method: "POST",
        headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json",
        },
  };

  const r = https.request(options, (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => console.log("send status", resp.statusCode, data));
  });

  r.on("error", (e) => console.error("send error:", e));
    r.write(payload);
    r.end();
}

    // Subscribe WABA to this app on startup
const WABA_ID = "1638766997323046";
const APP_ID = "1729079784960748";

async function subscribeWABA() {
      if (!ACCESS_TOKEN) {
              console.warn("ACCESS_TOKEN not set, skipping WABA subscription");
              return;
      }
      try {
              const options = {
                        hostname: "graph.facebook.com",
                        path: `/v25.0/${WABA_ID}/subscribed_apps?app_id=${APP_ID}`,
                        method: "POST",
                        headers: {
                                    "Authorization": `Bearer ${ACCESS_TOKEN}`,
                                    "Content-Type": "application/x-www-form-urlencoded",
                        },
              };
              const req = https.request(options, (res) => {
                        let data = "";
                        res.on("data", (chunk) => (data += chunk));
                        res.on("end", () => {
                                    console.log("WABA subscription response:", res.statusCode, data);
                        });
              });
              req.on("error", (e) => console.error("WABA subscription error:", e));
              req.end();
      } catch (e) {
              console.error("Failed to subscribe WABA:", e);
      }
}

app.listen(PORT, () => {
      console.log(`WhatsApp webhook listening on port ${PORT}`);
      subscribeWABA();
});

