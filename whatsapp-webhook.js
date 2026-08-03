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
const human = new Map();
const chats = new Map();
const INBOX_PIN = process.env.INBOX_PIN || "72934";

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

const TXT_CLINIC = "🏥 *Consultation at our Andheri West clinic*\n\n👨‍⚕️ Dr. Akshay Gosavi: *Rs 3999*\n🩺 Senior Physiotherapist: *Rs 999*\n\nYour consultation includes a full assessment and your treatment plan.\n\n🕐 Dr. Akshay's consultation slots: *1 PM and 6 PM*\n\nTap *Book a session* in the menu and our care team will confirm your slot right here on WhatsApp ✅";
const TXT_HOME = "🏠 *Home visit consultation, anywhere in Mumbai*\n\n🩺 Senior Physiotherapist: *Rs 1499*\n\nOur physio comes to you with everything needed for assessment and treatment. Dr. Akshay personally consults at the clinic and online.\n\nTap *Book a session* in the menu and our care team will confirm your slot right here on WhatsApp ✅";
const TXT_ASK_LOCATION = "🌍 Online consultations are available *worldwide*.\n\nWhich city and country will you be in during your session? Please also share your preferred time in *your local time* 🕐";
const TXT_NOTED = "Noted, thank you! 🙏 Our care team will keep this in mind while confirming your slot.\n\nTap *Book a session* in the menu whenever you are ready and we will lock it in for you.";
const TXT_ONLINE_INDIA = "💻 *Online video consultation from India*\n\n👨‍⚕️ Dr. Akshay Gosavi: *Rs 3499*\n🩺 Senior Physiotherapist: *Rs 999*\n\n🕐 Dr. Akshay's consultation slots: *1 PM and 6 PM IST*\nLocation is confirmed while scheduling.\n\nTap *Book a session* in the menu and our care team will confirm your slot right here on WhatsApp ✅";
const TXT_INTL = "🌍 Thank you!\n\nOur care team personally handles bookings outside India. They will message you here shortly with your consultation details, charges and slots that suit your time zone 🕐";
const TXT_PHYSIOS = "👨‍⚕️ *Dr. Akshay Gosavi, Founder of Physiocally*\nMasters in Physiotherapy (MUHS)\n10 years of clinical experience\nExpert in accurately diagnosing the root cause of pain\n\n🩺 *Our Senior Physiotherapists*\nQualified, experienced and experts in diagnosing and treating musculoskeletal pain, rated highly by our patients.\n\n⭐ *Physiocally* has delivered over *1,00,000 sessions* since 2022 with a *4.8 star* Google rating.";
const TXT_ASK_CONDITION = "Tell me what you are dealing with, for example back pain, migraine or knee pain, and I will tell you how physiotherapy can help 💬";

const COND_CTA = "\n\n📅 *Book a consultation* and our physio will assess your case and design your plan.";
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
        logChat(from, "in", "[Booking form submitted]");
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
      if (id) { logChat(from, "in", (it.list_reply && it.list_reply.title) || (it.button_reply && it.button_reply.title) || id); if (isHuman(from)) return; routeSelection(from, id); return; }
      return;
    }
    if (msg.type === "text") {
      const body = (msg.text?.body || "").trim();
      logChat(from, "in", body);
      if (isHuman(from)) return;
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
    setHuman(from, 6);
    return;
  }
  setState(from, "post_location");
}

function handleCondition(from, body) {
  const low = body.toLowerCase();
  const hit = CONDITIONS.find((c) => c.k.some((k) => low.includes(k)));
  sendTextTo(from, (hit ? hit.t : COND_FALLBACK) + COND_CTA);
}

function waSend(payload, label, onFail) {
  try { chatLogOut(payload); } catch (e) {}
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
      body: { text: "Namaste from *Physiocally* 🙏\nWe are happy to help you feel better.\n\nTap an option below and I will get you the answer right away 👇" },
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
      body: { text: "Where would you like your session? 🏥" },
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
      body: { text: "Great! 🎉 Fill this quick form and our care team will confirm your slot right here on WhatsApp." },
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
  hydrateChats();
});

// ---- MINI INBOX (manual chat as the clinic number) ----
function logChat(phone, dir, text) {
  if (!phone) return;
  let a = chats.get(phone);
  if (!a) { a = []; chats.set(phone, a); }
  a.push({ d: dir, t: String(text || "").slice(0, 1000), ts: Date.now() });
  if (a.length > 200) a.splice(0, a.length - 200);
  postToSheet({ type: "chat", phone: phone, dir: dir, text: String(text || "").slice(0, 500) });
}

function chatLogOut(payload) {
  const to = payload.to;
  if (!to) return;
  let txt = "";
  if (payload.type === "text") txt = payload.text.body;
  else if (payload.type === "interactive") {
    const it = payload.interactive;
    const kind = it.type === "list" ? "Menu" : it.type === "button" ? "Buttons" : it.type === "flow" ? "Booking form" : "Interactive";
    txt = "[" + kind + "] " + ((it.body && it.body.text) || "");
  }
  else if (payload.type === "template") txt = "[Template: " + payload.template.name + "]";
  else if (payload.type === "document") txt = "[Document: " + (payload.document.filename || "file") + "]";
  else txt = "[" + payload.type + "]";
  let a = chats.get(to);
  if (!a) { a = []; chats.set(to, a); }
  a.push({ d: "out", t: txt.slice(0, 1000), ts: Date.now() });
  if (a.length > 200) a.splice(0, a.length - 200);
  postToSheet({ type: "chat", phone: to, dir: "out", text: txt.slice(0, 500) });
}

function isHuman(p) {
  const t = human.get(p);
  if (!t) return false;
  if (Date.now() > t) { human.delete(p); return false; }
  return true;
}

function setHuman(p, hours) {
  human.set(p, Date.now() + (hours || 6) * 3600 * 1000);
}

app.get("/inbox", (req, res) => {
  if (req.query.pin !== INBOX_PIN) return res.status(403).send("Physiocally Inbox. Open with /inbox?pin=YOURPIN");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(INBOX_HTML.replace("__PIN__", INBOX_PIN));
});

app.get("/inbox/data", (req, res) => {
  if (req.query.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  if (!hydrated && chats.size === 0) hydrateChats();
  const threads = [];
  chats.forEach((msgs, phone) => {
    threads.push({ phone: phone, human: isHuman(phone), last: msgs.length ? msgs[msgs.length - 1].ts : 0, msgs: msgs });
  });
  threads.sort((a, b) => b.last - a.last);
  res.json({ threads: threads });
});

app.post("/inbox/send", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  const text = String(b.text || "").trim();
  if (phone.length < 11 || !text) return res.status(400).json({ error: "phone and text required" });
  waSend({ messaging_product: "whatsapp", to: phone, type: "text", text: { preview_url: false, body: text } }, "inbox send", () => sendAlert("Reply to wa.me/" + phone + " could not be delivered. The 24 hour chat window may be closed."));
  setHuman(phone, 6);
  res.json({ ok: true });
});

app.post("/inbox/bot", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (b.on) { human.delete(phone); } else { setHuman(phone, 6); }
  res.json({ ok: true, human: isHuman(phone) });
});

const INBOX_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Physiocally Inbox</title>
<style>
:root { --grn:#0D4D2E; --gld:#B8860B; --bg:#f2f6f2; }
* { box-sizing:border-box; margin:0; font-family:system-ui,Segoe UI,Arial,sans-serif; }
body { height:100vh; display:flex; flex-direction:column; background:var(--bg); }
header { background:var(--grn); color:#fff; padding:10px 16px; font-weight:700; display:flex; justify-content:space-between; align-items:center; }
header small { color:#d9c98a; font-weight:400; }
main { flex:1; display:flex; min-height:0; }
#list { width:280px; border-right:1px solid #ddd; overflow-y:auto; background:#fff; }
.th { padding:12px 14px; border-bottom:1px solid #eee; cursor:pointer; }
.th:hover { background:#f0f7f0; }
.th.on { background:#e3efe3; }
.th .p { font-weight:700; color:#222; font-size:14px; }
.th .s { color:#777; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:3px; }
.th .b { font-size:10px; padding:1px 7px; border-radius:9px; color:#fff; float:right; }
.b.bot { background:#2e7d32; } .b.hum { background:var(--gld); }
#chat { flex:1; display:flex; flex-direction:column; min-width:0; }
#msgs { flex:1; overflow-y:auto; padding:18px; display:flex; flex-direction:column; gap:6px; }
.m { max-width:70%; padding:8px 12px; border-radius:12px; font-size:14px; white-space:pre-wrap; word-wrap:break-word; }
.in { background:#fff; align-self:flex-start; border:1px solid #e0e0e0; }
.out { background:#d7ecd7; align-self:flex-end; }
.m small { display:block; color:#999; font-size:10px; margin-top:4px; }
#bar { display:flex; gap:8px; padding:10px; background:#fff; border-top:1px solid #ddd; }
#txt { flex:1; padding:10px; border:1px solid #ccc; border-radius:8px; font-size:14px; resize:none; height:44px; }
button { background:var(--grn); color:#fff; border:0; border-radius:8px; padding:0 18px; font-weight:700; cursor:pointer; }
#togglebot { background:var(--gld); }
#empty { flex:1; display:flex; align-items:center; justify-content:center; color:#999; }
@media (max-width:700px){ #list{width:110px} .th .s{display:none} }
</style></head><body>
<header><span>Physiocally Inbox</span><small id="hint">replies go out as +91 85911 68633</small></header>
<main>
  <div id="list"></div>
  <div id="chat">
    <div id="msgs"><div id="empty">Select a chat</div></div>
    <div id="bar">
      <button id="togglebot" onclick="toggleBot()" style="display:none">Bot: on</button>
      <textarea id="txt" placeholder="Type a reply. Sending pauses the bot for 6 hours."></textarea>
      <button onclick="send()">Send</button>
    </div>
  </div>
</main>
<script>
const pin = "__PIN__";
let cur = null, data = { threads: [] };
function fmt(ts){ const d = new Date(ts); return d.toLocaleString("en-IN", { hour:"2-digit", minute:"2-digit", day:"2-digit", month:"short" }); }
async function load(){
  try {
    const r = await fetch("/inbox/data?pin=" + pin);
    data = await r.json();
    renderList();
    if (cur) renderChat();
  } catch(e){}
}
function renderList(){
  const el = document.getElementById("list");
  el.innerHTML = data.threads.map(t => {
    const lastMsg = t.msgs.length ? t.msgs[t.msgs.length-1].t : "";
    return '<div class="th ' + (cur === t.phone ? "on" : "") + '" onclick="openChat(\\'' + t.phone + '\\')">' +
      '<span class="b ' + (t.human ? "hum" : "bot") + '">' + (t.human ? "HUMAN" : "BOT") + '</span>' +
      '<div class="p">+' + t.phone + '</div><div class="s">' + lastMsg.replace(/</g, "&lt;") + '</div></div>';
  }).join("");
}
function openChat(p){ cur = p; renderList(); renderChat(); }
function renderChat(){
  const t = data.threads.find(x => x.phone === cur);
  const el = document.getElementById("msgs");
  const tb = document.getElementById("togglebot");
  if (!t) { el.innerHTML = '<div id="empty">Select a chat</div>'; tb.style.display = "none"; return; }
  tb.style.display = "";
  tb.textContent = t.human ? "Bot: OFF" : "Bot: ON";
  el.innerHTML = t.msgs.map(m => '<div class="m ' + (m.d === "in" ? "in" : "out") + '">' + m.t.replace(/</g, "&lt;") + '<small>' + fmt(m.ts) + '</small></div>').join("");
  el.scrollTop = el.scrollHeight;
}
async function send(){
  const txt = document.getElementById("txt");
  if (!cur || !txt.value.trim()) return;
  await fetch("/inbox/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin, phone: cur, text: txt.value.trim() }) });
  txt.value = "";
  setTimeout(load, 600);
}
async function toggleBot(){
  const t = data.threads.find(x => x.phone === cur);
  if (!t) return;
  await fetch("/inbox/bot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin, phone: cur, on: t.human }) });
  setTimeout(load, 400);
}
document.getElementById("txt").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
load(); setInterval(load, 8000);
</script></body></html>`;

// ---- CHAT HISTORY REHYDRATION (survives free tier restarts) ----
let hydrated = false;
function hydrateChats() {
  hydrated = true;
  const hbody = JSON.stringify({ key: SHEET_KEY, type: "chatload" });
  const hu = new URL(SHEET_URL);
  const hreq = https.request({ hostname: hu.hostname, path: hu.pathname + hu.search, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(hbody) } }, (res) => {
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
      res.resume();
      https.get(res.headers.location, (r2) => collectHistory(r2));
      return;
    }
    collectHistory(res);
  });
  hreq.on("error", (e) => { hydrated = false; console.log("hydrate error", e.message); });
  hreq.write(hbody);
  hreq.end();
}
function collectHistory(res) {
  let d = "";
  res.on("data", (c) => { d += c; });
  res.on("end", () => {
    try {
      const data = JSON.parse(d);
      if (!data.rows) { console.log("hydrate: no rows"); return; }
      data.rows.forEach((r) => {
        const phone = String(r[1] || "");
        if (!phone) return;
        let a = chats.get(phone);
        if (!a) { a = []; chats.set(phone, a); }
        a.push({ d: r[2] === "out" ? "out" : "in", t: String(r[3] || "").slice(0, 1000), ts: Number(r[0]) || Date.now() });
      });
      chats.forEach((a) => { a.sort((x, y) => x.ts - y.ts); if (a.length > 200) a.splice(0, a.length - 200); });
      console.log("hydrated chats:", chats.size, "threads");
    } catch (e) { console.log("hydrate parse error", e.message); }
  });
  res.on("error", () => { hydrated = false; });
}
