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

const FLOW_ID = "998093659903522";
const FDO_ALERT = process.env.FDO_ALERT_NUMBER || "918169168633";

const seen = new Set();
const fbSent = new Set();
const state = new Map();

function setState(from, s) { state.set(from, { s, ts: Date.now() }); }
function getState(from) {
  const v = state.get(from);
  if (!v) return null;
  if (Date.now() - v.ts > 30 * 60 * 1000) { state.delete(from); return null; }
  return v.s;
}

const SHEET_URL = "https://script.google.com/macros/s/AKfycbzCj4Zb0RzCJtGhdhq28oZd_QVYUTbxQNSEzrJRGZ4tS5zpLivp92e0FMv-a7ejxBes/exec";
const SHEET_KEY = "phy-enq-7xK93qQ2mR8v";

const FALLBACK_TEXT = "Namaste from Physiocally! We can help with back pain, neck pain, sports injuries, post surgery recovery and more. To book a session, reply with your name, preferred mode (clinic, home visit or online) and preferred time. Our care team will confirm your slot right here on WhatsApp. You can also book at https://www.physiocally.com/book";

const TXT_CLINIC = "Consultation at our Andheri West clinic: with Dr. Akshay Gosavi Rs 3999, with our senior physiotherapist Rs 999. The consultation includes a full assessment and your treatment plan. Dr. Akshay's consultation slots are 1 PM and 6 PM. Tap Book a session in the menu and our care team will confirm your slot right here on WhatsApp.";
const TXT_HOME = "Home visit consultation anywhere in Mumbai with our senior physiotherapist: Rs 1499. Our physio comes to you with everything needed for assessment and treatment. Dr. Akshay personally consults at the clinic and online. Tap Book a session in the menu and our care team will confirm your slot right here on WhatsApp.";
const TXT_ASK_LOCATION = "Online consultations are available worldwide. Which city and country will you be in during your session? Please also share your preferred time in your local time.";
const TXT_NOTED = "Noted, thank you! Our care team will keep this in mind while confirming your slot. Tap Book a session in the menu whenever you are ready and we will lock it in for you.";
const TXT_ONLINE_INDIA = "Online video consultation from India: with Dr. Akshay Gosavi Rs 3499, with our senior physiotherapist Rs 999. Dr. Akshay's consultation slots are 1 PM and 6 PM IST. Location is confirmed while scheduling. Tap Book a session in the menu and our care team will confirm your slot right here on WhatsApp.";
const TXT_INTL = "Thank you! Our care team personally handles bookings outside India. They will message you here shortly with your consultation details, charges and slots that suit your time zone.";
const TXT_PHYSIOS = "Dr. Akshay Gosavi, Founder of Physiocally. Masters in Physiotherapy from MUHS, 10 years of clinical experience and known for accurately diagnosing the root cause of pain.\n\nOur senior physiotherapists are qualified, experienced and experts in diagnosing and treating musculoskeletal pain, rated highly by our patients.\n\nPhysiocally has delivered over 1,00,000 sessions since 2022 with a 4.8 star Google rating.";
const TXT_ASK_CONDITION = "Tell me what you are dealing with, for example back pain, migraine or knee pain, and I will tell you how physiotherapy can help.";

const COND_CTA = " Book a consultation and our physio will assess your case and design your plan.";
const CONDITIONS = [
  { k: ["migraine", "headache", "head ache"], t: "Many headaches and migraines have a neck related trigger. Physiotherapy relieves muscle tension and stiffness in the neck and shoulders and can reduce how often and how strongly they occur." },
  { k: ["neck", "cervical"], t: "Neck pain and stiffness respond well to physiotherapy. We use targeted movement, deep neck muscle activation and workstation guidance to relieve pain at its source." },
  { k: ["sciatica", "disc", "numbness", "nerve", "leg pain"], t: "Sciatica, slip disc related pain and leg numbness are among the most common conditions we treat. Directional movement and core strengthening relieve nerve pressure naturally." },
  { k: ["back", "spine", "lumbar"], t: "Back pain responds very well to physiotherapy. Guided movement, core activation and posture correction reduce pain and prevent it from coming back, without medicines." },
  { k: ["knee", "arthritis"], t: "Knee pain, early arthritis and ligament issues improve with strengthening and movement retraining. Physiotherapy helps you walk, climb and exercise without pain." },
  { k: ["shoulder", "frozen", "rotator"], t: "Frozen shoulder, rotator cuff pain and stiffness respond well to guided mobilisation and strengthening. Most patients regain full use of the arm with a structured plan." },
  { k: ["surgery", "operation", "post op", "postop", "replacement"], t: "After surgery, the right rehabilitation decides how fully you recover. Our physios design stage wise programs for knee, hip, spine, shoulder and other surgeries." },
  { k: ["sport", "sprain", "ligament", "acl", "injury"], t: "From sprains to overuse injuries, physiotherapy gets you back to your sport safely and builds strength so the injury does not repeat." },
];
const COND_FALLBACK = "Physiotherapy helps with a wide range of muscle, joint and nerve conditions. Our physio will personally review your case in the consultation and guide you on how much it can help you.";

const INDIA_HINTS = ["india", "mumbai", "bombay", "delhi", "pune", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata", "ahmedabad", "jaipur", "thane", "navi", "nagpur", "indore", "surat", "lucknow", "goa", "kochi", "cochin", "chandigarh", "noida", "gurgaon", "gurugram", "bhopal", "patna", "kanpur", "vadodara", "nashik", "rajkot", "andheri"];

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
      const st = value.statuses[0];
      if (st?.status === "failed" && st.recipient_id && !fbSent.has(st.recipient_id)) {
        fbSent.add(st.recipient_id);
        setTimeout(() => fbSent.delete(st.recipient_id), 6 * 60 * 60 * 1000);
        sendText(st.recipient_id);
      }
    }
    const msg = value?.messages?.[0];
    if (!msg) return;
    if (seen.has(msg.id)) return;
    seen.add(msg.id);
    const from = msg.from;
    if (msg.type === "interactive") {
      const it = msg.interactive;
      if (it?.type === "nfm_reply") {
        let flow = {};
        try { flow = JSON.parse(it.nfm_reply.response_json); } catch (e) {}
        if (flow.overall_rating) {
          postToSheet({ type: "feedback", phone: from, case_id: flow.case_id, physio: flow.physio, case_type: flow.case_type, overall_rating: flow.overall_rating, physio_rating: flow.physio_rating, recommend: flow.recommend, improve: flow.improve });
        } else {
          postToSheet({ phone: from, name: flow.patient_name, mode: flow.mode, join_from: flow.join_from, time_pref: flow.time_pref, physio_choice: flow.physio_choice, condition: flow.condition, start_when: flow.start_when, source: flow.source });
        }
        return;
      }
      const id = it?.list_reply?.id || it?.button_reply?.id;
      if (id) { routeSelection(from, id); return; }
      return;
    }
    if (msg.type === "text") {
      const body = (msg.text?.body || "").trim();
      const st = getState(from);
      if (st === "awaiting_location") { state.delete(from); handleLocation(from, body); return; }
      if (st === "awaiting_condition") { state.delete(from); handleCondition(from, body); return; }
      if (st === "post_location") { state.delete(from); sendTextTo(from, TXT_NOTED); return; }
      sendMenu(from);
      return;
    }
    sendMenu(from);
  } catch (e) {
    console.error("handler error:", e);
  }
});

function routeSelection(from, id) {
  if (id === "menu_charges") return sendModeButtons(from);
  if (id === "menu_book") return sendFlow(from);
  if (id === "menu_physios") return sendTextTo(from, TXT_PHYSIOS);
  if (id === "menu_condition") { setState(from, "awaiting_condition"); return sendTextTo(from, TXT_ASK_CONDITION); }
  if (id === "mode_clinic") return sendTextTo(from, TXT_CLINIC);
  if (id === "mode_home") return sendTextTo(from, TXT_HOME);
  if (id === "mode_online") { setState(from, "awaiting_location"); return sendTextTo(from, TXT_ASK_LOCATION); }
  sendMenu(from);
}

function handleLocation(from, body) {
  const low = body.toLowerCase();
  const isIndia = INDIA_HINTS.some((h) => low.includes(h));
  if (isIndia) {
    sendTextTo(from, TXT_ONLINE_INDIA);
  } else {
    sendTextTo(from, TXT_INTL);
    sendAlert("INTL enquiry: wa.me/" + from + " wants an online session. They said: " + body);
    postToSheet({ phone: from, mode: "Online", join_from: body, source: "INTL chat" });
  }
  setState(from, "post_location");
}

function handleCondition(from, body) {
  const low = body.toLowerCase();
  const hit = CONDITIONS.find((c) => c.k.some((k) => low.includes(k)));
  sendTextTo(from, (hit ? hit.t : COND_FALLBACK) + COND_CTA);
}

function waSend(payload, label, onFail) {
  const body = JSON.stringify(payload);
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
    resp.on("end", () => {
      console.log(label + " status", resp.statusCode, data);
      if (resp.statusCode !== 200 && onFail) onFail();
    });
  });
  r.on("error", (e) => console.error(label + " error:", e));
  r.write(body);
  r.end();
}

function sendTextTo(to, text) {
  waSend({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: text } }, "send text");
}

function sendAlert(text) {
  waSend({
    messaging_product: "whatsapp",
    to: FDO_ALERT,
    type: "template",
    template: {
      name: "physiocally_team_alert",
      language: { code: "en" },
      components: [
        { type: "body", parameters: [{ type: "text", text: text }] },
      ],
    },
  }, "send alert", () => sendTextTo(FDO_ALERT, text));
}

function sendText(to) {
  waSend({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: true, body: FALLBACK_TEXT } }, "send fallback");
}

function sendMenu(to) {
  waSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Namaste from Physiocally! We are happy to help you feel better. Tap an option below and I will get you the answer right away." },
      action: {
        button: "Choose an option",
        sections: [
          {
            title: "Physiocally",
            rows: [
              { id: "menu_charges", title: "Charges and booking" },
              { id: "menu_book", title: "Book a session" },
              { id: "menu_physios", title: "About our physios" },
              { id: "menu_condition", title: "Ask about a condition" },
            ],
          },
        ],
      },
    },
  }, "send menu", () => sendText(to));
}

function sendModeButtons(to) {
  waSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Where would you like your session?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "mode_clinic", title: "Clinic Andheri West" } },
          { type: "reply", reply: { id: "mode_home", title: "Home visit Mumbai" } },
          { type: "reply", reply: { id: "mode_online", title: "Online consultation" } },
        ],
      },
    },
  }, "send mode buttons");
}

function sendFlow(to) {
  waSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Great! Fill this quick form and our care team will confirm your slot right here on WhatsApp." },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: FLOW_ID,
          flow_cta: "Book Your Session",
          flow_action: "navigate",
          flow_action_payload: { screen: "BOOK" },
        },
      },
    },
  }, "send flow", () => sendTemplate(to));
}

function sendTemplate(to) {
  waSend({
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
  }, "send template", () => sendText(to));
}

const WABA_ID = "2014782522576835";
const APP_ID = "27390874840604813";

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

// Payment recorded in the sheet -> booking confirmation + invoice to patient
app.post("/notify", (req, res) => {
  try {
    const b = req.body || {};
    if (b.key !== SHEET_KEY) return res.status(403).json({ error: "forbidden" });
    const phone = String(b.phone || "").replace(/[^0-9]/g, "").replace(/^(\d{10})$/, "91$1");
    if (phone.length < 11) return res.status(400).json({ error: "valid phone required" });
    const name = b.name || "there";
    const amount = b.amount ? "Rs " + b.amount : "your payment";
    const physio = b.physio ? " with " + b.physio : "";
    const confirmText = "Namaste " + name + "! Your payment of " + amount + " is received and your booking" + physio + " is confirmed. Our care team will share your session timing right here on WhatsApp. For any change just reply on this chat. Thank you for choosing Physiocally!";
    waSend({ messaging_product: "whatsapp", to: phone, type: "text", text: { preview_url: false, body: confirmText } }, "send confirm", () => sendAlert("Auto confirmation could not be delivered to wa.me/" + phone + ". Please confirm the booking manually."));
    if (b.invoice_url) {
      setTimeout(() => {
        waSend({ messaging_product: "whatsapp", to: phone, type: "document", document: { link: b.invoice_url, filename: b.invoice_name || "Physiocally_Invoice.pdf" } }, "send invoice", () => sendTextTo(phone, "Your invoice: " + b.invoice_url));
      }, 2000);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("notify error:", e);
    res.status(500).json({ error: "internal" });
  }
});

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
    if (!b.phone || String(b.phone).replace(/[^0-9]/g, "").length < 8) {
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
