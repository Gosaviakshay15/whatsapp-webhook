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

const SHEET_URL = "https://script.google.com/macros/s/AKfycbzCj4Zb0RzCJtGhdhq28oZd_QVYUTbxQNSEzrJRGZ4tS5zpLivp92e0FMv-a7ejxBes/exec";
const SHEET_KEY = "phy-enq-7xK93qQ2mR8v";

function postToSheet(obj) {
        try {
                  const payload = JSON.stringify({ key: SHEET_KEY, ...obj });
                  const u = new URL(SHEET_URL);
                  const options = {
                              hostname: u.hostname,
                              path: u.pathname + u.search,
                              method: "POST",
                              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
                  };
                  const r = https.request(options, (resp) => {
                              let data = "";
                              resp.on("data", (c) => (data += c));
                              resp.on("end", () => console.log("sheet log status", resp.statusCode));
                  });
                  r.on("error", (e) => console.error("sheet log error:", e));
                  r.write(payload);
                  r.end();
        } catch (e) {
                  console.error("postToSheet error:", e);
        }
}


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
                  if (value?.statuses) {
                              console.log("status update:", JSON.stringify(value.statuses));
                  }
                  const msg = value?.messages?.[0];
                  if (!msg) return;
                  if (seen.has(msg.id)) return;
                  seen.add(msg.id);
                  if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {
                              let flow = {};
                              try { flow = JSON.parse(msg.interactive.nfm_reply.response_json); } catch (e) {}
                              if (flow.overall_rating) {
                                            postToSheet({ type: "feedback", phone: msg.from, case_id: flow.case_id, physio: flow.physio, case_type: flow.case_type, overall_rating: flow.overall_rating, physio_rating: flow.physio_rating, recommend: flow.recommend, improve: flow.improve });
                              } else {
                                            postToSheet({ phone: msg.from, name: flow.patient_name, mode: flow.mode, join_from: flow.join_from, time_pref: flow.time_pref, physio_choice: flow.physio_choice, condition: flow.condition, start_when: flow.start_when, source: flow.source });
                              }
                              return;
                  }
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
                              components: [
                                    {
                                                    type: "button",
                                                    sub_type: "flow",
                                                    index: "0",
                                                    parameters: [
                                                          { type: "action", action: { flow_token: "unused" } },
                                                                    ],
                                    },
                                          ],
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
                                            Authorization: `Bearer ${ACCESS_TOKEN}`,
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


// Website booking form (Wix landing page) -> sheet
app.options("/wix", (req, res) => {
        res.set({
                  "Access-Control-Allow-Origin": "*",
                  "Access-Control-Allow-Methods": "POST, OPTIONS",
                  "Access-Control-Allow-Headers": "Content-Type",
        });
        res.sendStatus(204);
});

app.post("/wix", (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        try {
                  const b = req.body || {};
                  if (!b.phone || String(b.phone).replace(/[^0-9]/g, "").length < 10) {
                              return res.status(400).json({ error: "valid phone required" });
                  }
                  postToSheet({
                              phone: String(b.phone).replace(/[^0-9]/g, "").replace(/^(\d{10})$/, "91$1"),
                              name: b.name, mode: b.mode, join_from: b.join_from || "",
                              time_pref: b.time_pref, physio_choice: b.physio_choice,
                              condition: b.condition, start_when: b.start_when,
                              source: "Website",
                  });
                  res.json({ ok: true });
        } catch (e) {
                  console.error("wix route error:", e);
                  res.status(500).json({ error: "internal" });
        }
});

app.listen(PORT, () => {
        console.log(`WhatsApp webhook listening on port ${PORT}`);
        subscribeWABA();
});
