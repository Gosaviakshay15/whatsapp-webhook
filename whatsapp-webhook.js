const express = require("express");
const https = require("https");
const app = express();
app.use(express.json({ limit: "30mb" }));

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

const TXT_CLINIC = "🏥 *Consultation at our Andheri West clinic*\n\nTo get you the best results, we offer two starting points:\n\n*Option 1 — Senior Team Assessment: Rs 999*\nA detailed one on one evaluation with our senior physiotherapists, using Dr. Akshay's exact diagnostic framework to find your root cause and build your custom plan.\n🕐 Slots usually available within 24 hours\n\n*Option 2 — Premium Assessment with Dr. Akshay: Rs 3999*\nA one on one evaluation directly with Dr. Akshay.\n🕐 Slots are limited and may require a wait\n\nTap *Book a session* below and our care team will confirm your slot right here on WhatsApp ✅";
const TXT_HOME = "🏠 *Home visit consultation, anywhere in Mumbai*\n\n🩺 Senior Physiotherapist: *Rs 1499*\nSession charges reduce when a longer treatment plan is needed.\n\nOur physio comes to you with everything needed for assessment and treatment. Dr. Akshay personally consults at the clinic and online.\n\nTap *Book a session* below and our care team will confirm your slot right here on WhatsApp ✅";
const TXT_ASK_LOCATION = "🌍 Online consultations are available *worldwide*.\n\nSo we can schedule correctly across time zones, which city and country will you be in during your session, and what time suits you *in your local time*? 🕐";
const TXT_NOTED = "Noted, thank you! Our care team will keep this in mind while confirming your slot.\n\nTap *Book a session* below whenever you are ready and we will lock it in for you.";
const TXT_ONLINE_INDIA = "💻 *Online video consultation from India*\n\nTo get you the best results, we offer two starting points:\n\n*Option 1 — Senior Team Assessment: Rs 999*\nA detailed one on one evaluation with our senior physiotherapists, using Dr. Akshay's exact diagnostic framework to find your root cause and build your custom plan.\n🕐 Slots usually available within 24 hours\n\n*Option 2 — Premium Assessment with Dr. Akshay: Rs 3499*\nA one on one evaluation directly with Dr. Akshay.\n🕐 Dr. Akshay consults at *1 PM and 6 PM IST*, slots are limited\n\n📱 Sessions run on a video call link we share before your slot, and last *40 to 60 minutes*.\n\nTap *Book a session* below and our care team will confirm your slot right here on WhatsApp ✅";
const TXT_INTL = "🌍 Thank you!\n\nOur care team personally handles bookings outside India. They will message you here with your consultation details, charges and slots that suit your time zone.\n\n🕐 Our team is available *9 AM to 9 PM IST*";
const TXT_PHYSIOS = "👨‍⚕️ *Dr. Akshay Gosavi, Founder of Physiocally*\nMasters in Physiotherapy (MUHS)\n10 years of clinical experience\nExpert in accurately diagnosing the root cause of pain\n\n🩺 *Our Senior Physiotherapists*\nQualified, experienced and experts in diagnosing and treating musculoskeletal pain, rated highly by our patients.\n\n⭐ *Physiocally* has delivered over *1,00,000 sessions* since 2022 with a *4.8 star* Google rating.";
const TXT_ASK_CONDITION = "Tell me what you are dealing with, for example back pain, migraine or knee pain, and I will tell you how physiotherapy can help 💬";

const TXT_FORM_ACK = "Thank you! Your details are with our care team.\n\nOur team will check availability and confirm your slot right here on WhatsApp shortly 🕐";
const TXT_UPSELL_PACKS = "To make your treatment more consistent, we have:\n\n📦 *5 Sessions* — Rs 949 per session\n📦 *10 Sessions* — Rs 899 per session\n\n(Advance payment required for package pricing)\n\nPackages help in faster recovery and better results.\n\nWhich one would you like to go ahead with?";
const TXT_UPSELL_NEXT = "A single follow up session is *Rs 999*.\n\nReply here and our care team will schedule your next session at a time that suits you ✅";
const TXT_UPSELL_NO = "No problem! Whenever you are ready, just message us here. Wishing you a speedy recovery 💚";
const COND_CTA = "\n\n📅 Tap *Book a session* below and our physio will assess your case and design your plan.";
const CONDITIONS = [
  { k: ["vertigo", "dizzy", "dizziness", "giddiness", "bppv", "balance"], t: "Vertigo and giddiness often come from the inner ear or the neck. Our physiotherapists assess the cause and use proven repositioning techniques and balance retraining, and most patients improve quickly once the right cause is identified." },
  { k: ["tmj", "jaw", "jaw pain", "lock jaw", "clicking jaw"], t: "Jaw and TMJ pain responds well to physiotherapy. We release the jaw and neck muscles, correct the movement pattern and guide you on habits that keep the pain from returning." },
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
    try { const pn = value && value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name; const wa = value && value.contacts && value.contacts[0] && value.contacts[0].wa_id; if (pn && wa) waNames.set(String(wa), String(pn).slice(0, 40)); } catch (e) {}
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
        logChat(from, "in", formSummary(flow));
        setTimeout(() => sendTextTo(from, TXT_FORM_ACK), 1200);
        if (flow.overall_rating) {
          postToSheet({ type: "feedback", phone: from, case_id: flow.case_id, physio: flow.physio, case_type: flow.case_type, overall_rating: flow.overall_rating, physio_rating: flow.physio_rating, recommend: flow.recommend, improve: flow.improve });
        } else {
          postToSheet({ phone: from, name: flow.patient_name, mode: flow.mode, join_from: flow.join_from, time_pref: flow.time_pref, physio_choice: flow.physio_choice, condition: flow.condition, start_when: flow.start_when, source: flow.source });
          if (flow.patient_name) patientNames.set(from, String(flow.patient_name).trim());
          const jf = String(flow.join_from || "").toLowerCase();
          const sw = String(flow.start_when || "").toLowerCase();
          const intl = jf && jf.indexOf("india") === -1;
          const exploring = sw.indexOf("exploring") !== -1;
          const bits = [];
          if (flow.mode) bits.push(String(flow.mode));
          if (flow.condition) bits.push(String(flow.condition).slice(0, 70));
          if (flow.start_when) bits.push("start: " + flow.start_when);
          if (flow.time_pref) bits.push("prefers " + flow.time_pref);
          if (flow.physio_choice) bits.push(String(flow.physio_choice));
          if (flow.join_from) bits.push("joining from " + flow.join_from);
          const tag = exploring ? "Booking form JUST EXPLORING" : intl ? "INTERNATIONAL booking form" : "NEW BOOKING FORM";
          const ask = exploring ? "They are not ready to book yet. Please send information and keep it warm, do not push for a slot." : intl ? "Please handle this booking personally and share charges in their currency." : "Please check availability, confirm the slot and share the payment details.";
          sendAlert(tag + ": " + (flow.patient_name || nameFor(from)) + ", wa.me/" + from + ". " + bits.join(", ") + ". " + ask);
        }
        return;
      }
      const id = it?.list_reply?.id || it?.button_reply?.id;
      if (id && id.indexOf("media_") === 0) { logChat(from, "in", (it.button_reply && it.button_reply.title) || id); handleMediaChoice(from, id); return; }
      if (id) { logChat(from, "in", (it.list_reply && it.list_reply.title) || (it.button_reply && it.button_reply.title) || id); if (isHuman(from)) return; routeSelection(from, id); return; }
      return;
    }
    if (msg.type === "text") {
      const body = (msg.text?.body || "").trim();
      logChat(from, "in", body);
      if (isHuman(from)) return;
      if (checkSpecial(from, body)) return;
      const st = getState(from);
      if (st === "awaiting_location") { state.delete(from); handleLocation(from, body); return; }
      if (st === "awaiting_condition") { state.delete(from); handleCondition(from, body); return; }
      if (st === "post_location") { state.delete(from); if (checkIntent(from, body)) return; sendActions(from, TXT_NOTED, ["book", "menu"]); return; }
      if (checkIntent(from, body)) return;
      sendMenu(from);
      return;
    }
    if (msg.type === "image" || msg.type === "document" || msg.type === "audio" || msg.type === "video") { handleMedia(from, msg); return; }
    sendMenu(from);
  } catch (e) {
    console.error("handler error:", e);
  }
});

function routeSelection(from, id) {
  if (id === "menu_charges") return sendModeButtons(from);
  if (id === "menu_book") return sendFlow(from);
  if (id === "menu_physios") return sendActions(from, TXT_PHYSIOS, ["book", "menu"]);
  if (id === "menu_condition") { setState(from, "awaiting_condition"); return sendTextTo(from, TXT_ASK_CONDITION); }
  if (id === "mode_clinic") return sendActions(from, TXT_CLINIC, ["book", "addr", "menu"]);
  if (id === "mode_home") return sendActions(from, TXT_HOME, ["book", "menu"]);
  if (id === "act_book") return sendFlow(from);
  if (id === "act_menu") return sendMenu(from);
  if (id === "act_addr") return sendActions(from, TXT_ADDRESS, ["book", "menu"]);
  if (id === "mode_online") { setState(from, "awaiting_location"); return sendTextTo(from, TXT_ASK_LOCATION); }
  if (id === "upsell_packs") return sendPackButtons(from);
  if (id === "upsell_next") return sendSingleButtons(from);
  if (id.indexOf("pick_") === 0) return handlePick(from, id);
  sendMenu(from);
}

function handleLocation(from, body) {
  const low = body.toLowerCase();
  const isIndia = INDIA_HINTS.some((h) => low.includes(h));
  if (isIndia) {
    sendActions(from, TXT_ONLINE_INDIA, ["book", "menu"]);
  } else {
    sendTextTo(from, TXT_INTL);
    sendAlert("INTL enquiry: wa.me/" + from + " wants an online session. They said: " + body);
    postToSheet({ phone: from, mode: "Online", join_from: body, source: "INTL chat" });
    setHuman(from, 6);
    return;
  }
  setState(from, "post_location");
}

const RED_FLAGS = ["bladder", "urine", "incontinen", "saddle numb", "chest pain", "breathless", "cannot move", "can not move", "can't move", "unconscious", "fainted", "accident", "fracture", "broken bone", "fell down", "unable to stand", "cannot stand", "cannot walk", "can't walk"];
const CALLBACK_WORDS = ["call me", "callback", "call back", "phone me", "talk to someone", "speak to someone", "is anyone there", "real person", "human", "insurance", "cashless", "mediclaim", "reimburse", "gst", "corporate", "employees", "hr team", "tie up", "tie-up"];
const JOB_WORDS = ["vacancy", "job", "hiring", "career", "internship", "resume", "cv ", "apply for"];
const TXT_URGENT = "Thank you for sharing this.\n\nWhat you have described needs to be looked at urgently. Our care team will call you shortly to guide you.";
const TXT_CALLBACK = "Our care team will call you shortly on this number.\n\nYou can also reach the clinic directly on *7304181920* (9 AM to 9 PM).";
const TXT_JOBS = "Thank you for your interest in working with Physiocally.\n\nPlease send your CV on WhatsApp to *7304181920* and our team will get back to you.";

function checkSpecial(from, body) {
  const low = String(body || "").toLowerCase();
  if (JOB_WORDS.some((w) => low.includes(w))) {
    sendTextTo(from, TXT_JOBS);
    sendAlert("Careers enquiry from wa.me/" + from + ": " + String(body).slice(0, 120));
    setHuman(from, 1);
    return true;
  }
  if (RED_FLAGS.some((w) => low.includes(w))) {
    sendTextTo(from, TXT_URGENT);
    sendAlert("URGENT: possible red flag symptoms from wa.me/" + from + ". Message: " + String(body).slice(0, 160) + " Please call this patient now.");
    setHuman(from, 1);
    return true;
  }
  if (CALLBACK_WORDS.some((w) => low.includes(w))) {
    sendTextTo(from, TXT_CALLBACK);
    sendAlert("Callback requested from wa.me/" + from + ": " + String(body).slice(0, 140));
    setHuman(from, 1);
    return true;
  }
  return false;
}

function handleCondition(from, body) {
  if (checkSpecial(from, body)) return;
  const low = body.toLowerCase();
  const hit = CONDITIONS.find((c) => c.k.some((k) => low.includes(k)));
  sendActions(from, (hit ? hit.t : COND_FALLBACK) + COND_CTA, ["book", "menu"]);
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
        { type: "body", parameters: [{ type: "text", text: String(text).replace(/[\r\n]+/g, " ").slice(0, 900) }] },
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
      body: { text: "Which charges would you like to see? 🏥" },
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
    const confirmText = "Hi " + name + "\n\n✅ Your payment of *" + amount + "* has been received and your appointment is confirmed." + (b.physio ? "\n👨‍⚕️ Physiotherapist: *" + b.physio + "*" : "") + "\n\n📄 If you have any reports, scans or prescriptions, please share them here.\n\nYour invoice is attached below.";
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
  postToSheet({ type: "chat", phone: phone, dir: dir, text: String(text || "").slice(0, 500), name: String(waNames.get(phone) || "").slice(0, 40) });
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
  else if (payload.type === "template") {
    let tp = "";
    try { tp = payload.template.components[0].parameters.map((p) => p.text).join(" "); } catch (e) {}
    txt = tp ? "[Alert] " + tp : "[Template: " + payload.template.name + "]";
  }
  else if (payload.type === "document") txt = "[Sent file: " + (payload.document.filename || "file") + "] " + (payload.document.caption || "");
  else if (payload.type === "image") txt = "[Sent image] " + ((payload.image && payload.image.caption) || "");
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
  human.set(p, Date.now() + (hours || 1) * 3600 * 1000);
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
    const w = whoIs(phone);
    threads.push({ phone: phone, name: w.name, country: w.country, human: isHuman(phone), last: msgs.length ? msgs[msgs.length - 1].ts : 0, msgs: msgs });
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
#back { display:none; }
@media (max-width:760px){
  header { padding:8px 12px; font-size:15px; }
  header small { display:none; }
  main { position:relative; }
  #list { width:100%; }
  #chat { display:none; position:absolute; inset:0; background:var(--bg); }
  body.chatopen #list { display:none; }
  body.chatopen #chat { display:flex; }
  #back { display:inline-block; background:var(--grn); color:#fff; border:0; padding:8px 12px; border-radius:8px; font-weight:700; }
  #chathead { display:flex; gap:10px; align-items:center; padding:8px 10px; background:#fff; border-bottom:1px solid #ddd; }
  #chathead .who { font-weight:700; font-size:14px; }
  .th { padding:14px; }
  .th .s { display:block; }
  .m { max-width:88%; font-size:15px; }
  #msgs { padding:12px; }
  #bar { flex-wrap:wrap; gap:6px; padding:8px; }
  #bar button { padding:10px 12px; font-size:13px; flex:1 1 auto; }
  #bar textarea { flex:1 1 100%; order:-1; font-size:16px; min-height:44px; }
}
@media (min-width:761px){ #chathead { display:none; } }
</style></head><body>
<header><span id="hdr">Physiocally Inbox</span><small id="hint">replies go out as +91 85911 68633</small></header>
<main>
  <div id="list"></div>
  <div id="chat">
    <div id="chathead"><button id="back" onclick="closeChat()">Back</button><span class="who" id="who"></span></div>
    <div id="msgs"><div id="empty">Select a chat</div></div>
    <div id="bar">
      <button id="togglebot" onclick="toggleBot()" style="display:none">Bot: on</button>
      <button onclick="quick('payment')" title="Send payment details and QR">Payment details</button>
      <button onclick="quick('slotoffer')" title="Offer a slot before payment">Slot offer</button>
      <button onclick="quick('slot')" title="Compose a slot confirmation">Slot confirm</button>
      <button onclick="pickFile()" title="Send a prescription, report or invoice to this patient">Send file</button>
      <button onclick="sendUpsell()" title="Send the follow up offer">Follow up offer</button>
      <input type="file" id="fileinp" style="display:none" onchange="doFile()">
      <textarea id="txt" placeholder="Type a reply. Sending pauses the bot for 1 hour."></textarea>
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
      '<div class="p">' + (t.name ? t.name.replace(/</g, "&lt;") : "+" + t.phone) + '</div>' + '<div class="s" style="color:#7a7a7a">+' + t.phone + (t.country && t.country !== "India" ? ' \u00b7 ' + t.country : '') + '</div><div class="s">' + lastMsg.replace(/</g, "&lt;") + '</div></div>';
  }).join("");
}
function closeChat(){ document.body.classList.remove("chatopen"); }
function openChat(p){ cur = p; document.body.classList.add("chatopen"); const w = document.getElementById("who"); const th = (data.threads || []).find(x => x.phone === p); if (w) w.textContent = (th && th.name ? th.name + "  ·  " : "") + "+" + p + (th && th.country && th.country !== "India" ? "  ·  " + th.country : ""); renderList(); renderChat(); }
function renderChat(){
  const t = data.threads.find(x => x.phone === cur);
  const el = document.getElementById("msgs");
  const tb = document.getElementById("togglebot");
  if (!t) { el.innerHTML = '<div id="empty">Select a chat</div>'; tb.style.display = "none"; return; }
  tb.style.display = "";
  tb.textContent = t.human ? "Bot: OFF" : "Bot: ON";
  function md(x) { var h = String(x || "").replace(/</g, "&lt;"); return h.replace(new RegExp("https?://[^ \\n<]+", "g"), function(u) { var l = '<a href="' + u + '" target="_blank" style="color:inherit;word-break:break-all">' + u + '</a>'; if (u.indexOf("uc?export=view") !== -1) l += '<a href="' + u + '" target="_blank"><img src="' + u + '" style="max-width:220px;max-height:220px;border-radius:8px;display:block;margin-top:4px"/></a>'; return l; }); }
  el.innerHTML = t.msgs.map(m => '<div class="m ' + (m.d === "in" ? "in" : "out") + '">' + md(m.t) + '<small>' + fmt(m.ts) + '</small></div>').join("");
  el.scrollTop = el.scrollHeight;
}
async function quick(kind){
  if (!cur) { alert("Open a chat first"); return; }
  if (kind === "slotoffer") {
    const physio = prompt("Physio name? e.g. Dr. Akshay", "");
    if (!physio) return;
    const slot = prompt("Slot? e.g. Today at 6:00 PM", "");
    if (!slot) return;
    const fee = prompt("Consultation fee in Rs?", "999");
    if (!fee) return;
    document.getElementById("txt").value = "Hello! Confirming availability for your request\\n\\n*" + physio + "* has a slot open for you:\\n\u{1F4C5} *" + slot + "*\\n\u{1F4B0} Consultation fee: *Rs " + fee + "* (pre-payment required)\\n\\nPlease reply *Confirmed* and I will share the payment details.";
    document.getElementById("txt").focus();
    return;
  }
  if (kind === "slot") {
    const physio = prompt("Physio name?", "");
    if (!physio) return;
    const slot = prompt("Slot? e.g. Tomorrow 6:00 PM", "");
    if (!slot) return;
    document.getElementById("txt").value = "Your session is confirmed with *" + physio + "* on *" + slot + "*. Please be ready 5 minutes early. Reply here if you need to reschedule.";
    document.getElementById("txt").focus();
    return;
  }
  if (!confirm("Send payment details and QR to this patient?")) return;
  await fetch("/inbox/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin, phone: cur, kind: kind }) });
  setTimeout(load, 1200);
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
function pickFile(){
  if (!cur) { alert("Open a chat first"); return; }
  document.getElementById("fileinp").click();
}
function doFile(){
  const el = document.getElementById("fileinp");
  const f = el.files[0];
  if (!f) return;
  if (f.size > 15 * 1024 * 1024) { alert("That file is too large. Please keep it under 15 MB."); el.value = ""; return; }
  const cap = prompt("Message to send with this file", "Here is your prescription from today's session. Please follow it as advised and message us here if anything is unclear.");
  if (cap === null) { el.value = ""; return; }
  const rd = new FileReader();
  rd.onload = function(){
    const b64 = String(rd.result).split(",")[1];
    fetch("/inbox/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin, phone: cur, name: f.name, mime: f.type || "application/pdf", data: b64, caption: cap }) })
      .then(function(r){ return r.json().then(function(j){ return { s: r.status, j: j }; }); })
      .then(function(o){
        el.value = "";
        if (o.s === 409) { alert("This patient last messaged " + o.j.hours + " hours ago, so WhatsApp will not deliver a file right now. Ask them to send any message here first, then try again."); return; }
        if (!o.j.ok) { alert("Could not send: " + (o.j.error || "error")); return; }
        setTimeout(load, 800);
        if (confirm("File sent. Send the follow up offer now?")) sendUpsell();
      })
      .catch(function(){ el.value = ""; alert("Could not send the file. Please check your connection and try again."); });
  };
  rd.readAsDataURL(f);
}
function sendUpsell(){
  if (!cur) { alert("Open a chat first"); return; }
  if (!confirm("Send the follow up offer to this patient?")) return;
  fetch("/inbox/upsell", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin, phone: cur }) })
    .then(function(r){ return r.json(); })
    .then(function(j){ if (j.ok) setTimeout(load, 800); else alert("Could not send: " + (j.error || "error")); });
}
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
  if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) { res.resume(); https.get(res.headers.location, (r2) => collectHistory(r2)); return; }
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
        const nm = String(r[4] || "").trim();
        if (nm) waNames.set(phone, nm.slice(0, 40));
      });
      chats.forEach((a) => { a.sort((x, y) => x.ts - y.ts); if (a.length > 200) a.splice(0, a.length - 200); });
      console.log("hydrated chats:", chats.size, "threads");
    } catch (e) { hydrated = false; console.log("hydrate parse error", e.message); }
  });
  res.on("error", () => { hydrated = false; });
}


// ---- PATIENT MEDIA (images/PDFs -> Drive via sheet) ----
function storeMediaRetry(phone, name, mime, buf, cb) {
  storeMedia(phone, name, mime, buf, (u) => {
    if (u) return cb(u);
    console.log("media store returned empty url, retrying once");
    setTimeout(() => storeMedia(phone, name, mime, buf, (u2) => cb(u2 || "")), 2500);
  });
}

function handleMedia(from, msg) {
  const media = msg.image || msg.document || msg.audio || msg.video;
  if (!media || !media.id) return;
  const kind = msg.type;
  const caption = (media.caption || "").slice(0, 200);
  const ext = kind === "image" ? ".jpg" : kind === "audio" ? ".ogg" : kind === "video" ? ".mp4" : "";
  const fname = media.filename || (kind + "_" + Date.now() + ext);
  https.get({ hostname: "graph.facebook.com", path: "/v20.0/" + media.id, headers: { Authorization: "Bearer " + ACCESS_TOKEN } }, (r1) => {
    let d = "";
    r1.on("data", (c) => { d += c; });
    r1.on("end", () => {
      try {
        const info = JSON.parse(d);
        if (!info.url) { logChat(from, "in", "[" + kind + " received but could not be fetched]"); return; }
        downloadMedia(info.url, (buf) => {
          if (!buf) { logChat(from, "in", "[" + kind + " received but download failed]"); mediaAlert(from, kind, caption); return; }
          if (buf.length > 18 * 1024 * 1024) { logChat(from, "in", "[" + kind + " too large to store: " + fname + "]"); mediaAlert(from, kind, caption); return; }
          storeMediaRetry(from, fname, media.mime_type || "", buf, (url) => {
            const icon = kind === "image" ? "📷" : kind === "document" ? "📎" : "🎥";
            let txt = icon + " " + (caption ? caption + " - " : "") + fname;
            if (url) txt += "\n" + url;
            logChat(from, "in", txt);
            askMediaType(from, fname, url, kind);
          });
        });
      } catch (e) { console.log("media info error", e.message); }
    });
  }).on("error", (e) => console.log("media meta error", e.message));
}

function downloadMedia(u, cb) {
  let uo;
  try { uo = new URL(u); } catch (e) { cb(null); return; }
  https.get({ hostname: uo.hostname, path: uo.pathname + uo.search, headers: { Authorization: "Bearer " + ACCESS_TOKEN, "User-Agent": "node" } }, (r) => {
    if ((r.statusCode === 301 || r.statusCode === 302) && r.headers.location) { r.resume(); downloadMedia(r.headers.location, cb); return; }
    if (r.statusCode !== 200) { r.resume(); cb(null); return; }
    const parts = [];
    r.on("data", (c) => parts.push(c));
    r.on("end", () => cb(Buffer.concat(parts)));
    r.on("error", () => cb(null));
  }).on("error", () => cb(null));
}

function storeMedia(phone, name, mime, buf, cb) {
  const body = JSON.stringify({ key: SHEET_KEY, type: "media", phone: phone, name: name, who: String(waNames.get(String(phone)) || "").slice(0, 40), mime: mime, data: buf.toString("base64") });
  let u;
  try { u = new URL(SHEET_URL); } catch (e) { cb(""); return; }
  const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
      res.resume();
      https.get(res.headers.location, (r2) => collectMediaResp(r2, cb));
      return;
    }
    collectMediaResp(res, cb);
  });
  req.on("error", (e) => { console.log("media store error", e.message); cb(""); });
  req.write(body);
  req.end();
}

function collectMediaResp(res, cb) {
  if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) { res.resume(); https.get(res.headers.location, (r2) => collectMediaResp(r2, cb)); return; }
  let d = "";
  res.on("data", (c) => { d += c; });
  res.on("end", () => { try { const j = JSON.parse(d); cb(j.url || ""); } catch (e) { cb(""); } });
  res.on("error", () => cb(""));
}

function mediaAlert(from, kind, caption) {
  sendAlert("Patient sent a file (" + kind + ") from wa.me/" + from + (caption ? " - " + caption : "") + ". Open the clinic inbox to view it.");
}


// ---- UPSELL + REMINDERS (triggered from the sheet) ----
function sendPackButtons(to) {
  waSend({
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: TXT_UPSELL_PACKS },
      action: { buttons: [
        { type: "reply", reply: { id: "pick_5", title: "5 sessions" } },
        { type: "reply", reply: { id: "pick_10", title: "10 sessions" } },
        { type: "reply", reply: { id: "pick_single", title: "Single session" } }
      ] }
    }
  }, "pack options", () => sendTextTo(to, TXT_UPSELL_PACKS));
}

function sendSingleButtons(to) {
  waSend({
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: TXT_UPSELL_NEXT },
      action: { buttons: [
        { type: "reply", reply: { id: "pick_single", title: "Book my session" } },
        { type: "reply", reply: { id: "upsell_packs", title: "Package options" } }
      ] }
    }
  }, "single option", () => sendTextTo(to, TXT_UPSELL_NEXT));
}

function handlePick(from, id) {
  const label = id === "pick_5" ? "the 5 session package at Rs 949 per session"
    : id === "pick_10" ? "the 10 session package at Rs 899 per session"
    : "a single session at Rs 999";
  sendTextTo(from, "Thank you! Our care team will confirm your slot and share the payment details right here shortly.");
  sendAlert("Follow up confirmed: " + nameFor(from) + " has chosen " + label + ". wa.me/" + from + " Please confirm the slot and send the payment details.");
  setHuman(from, 2);
}

function sendUpsellButtons(to, name) {
  waSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Hi " + name + "!\n\nAs per the doctor's plan, your treatment requires follow up sessions for proper recovery.\n\nConsistency is important to reduce pain completely and avoid recurrence.\n\nWould you like to continue with your next session, or explore package options?" },
      action: { buttons: [
        { type: "reply", reply: { id: "upsell_next", title: "Next session" } },
        { type: "reply", reply: { id: "upsell_packs", title: "Package options" } }
      ] }
    }
  }, "upsell", () => sendAlert("Upsell message could not be delivered to wa.me/" + to + ". Please follow up manually."));
}

app.post("/upsell", (req, res) => {
  try {
    const b = req.body || {};
    if (b.key !== SHEET_KEY) return res.status(403).json({ error: "forbidden" });
    const phone = String(b.phone || "").replace(/[^0-9]/g, "").replace(/^(\d{10})$/, "91$1");
    if (phone.length < 11) return res.status(400).json({ error: "valid phone required" });
    sendUpsellButtons(phone, b.name || "there");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/remind", (req, res) => {
  try {
    const b = req.body || {};
    if (b.key !== SHEET_KEY) return res.status(403).json({ error: "forbidden" });
    const phone = String(b.phone || "").replace(/[^0-9]/g, "").replace(/^(\d{10})$/, "91$1");
    if (phone.length < 11) return res.status(400).json({ error: "valid phone required" });
    const rname = b.name || "there";
    const when = b.when || "today";
    waSend({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: { name: "physiocally_reminder", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: rname }, { type: "text", text: when }] }] }
    }, "reminder", () => sendTextTo(phone, "Hi " + rname + ", a gentle reminder from Physiocally: you have a physiotherapy session scheduled for " + when + ". Reply here if you would like to reschedule, or if you have any concerns after your last session."));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.post("/alert", (req, res) => {
  try {
    const b = req.body || {};
    if (b.key !== SHEET_KEY) return res.status(403).json({ error: "forbidden" });
    if (!b.text) return res.status(400).json({ error: "text required" });
    sendAlert(String(b.text).slice(0, 900));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});


// ---- SAVED REPLIES + FORM SUMMARY ----
const QR_URL = "https://drive.google.com/uc?export=view&id=1sEzHDSKGemgfQ9CwKJyi507X-N80GiV8";
const TXT_PAYMENT = "*Payment details*\n\nAccount Name: Physiocally\nAccount Number: 122505002473\nBank Name: ICICI Bank\nBranch: Andheri Veera Desai Road\nIFSC: ICIC0001225\nUPI ID: physiocallyaccount@icici\n\nPlease share the screenshot after the transaction\n\n📍 *Physiocally*, Andheri Veera Desai Road, Mumbai\nhttps://www.physiocally.com";

function formSummary(flow) {
  if (!flow || typeof flow !== "object") return "[Booking form submitted]";
  const L = [];
  if (flow.patient_name) L.push("Name: " + flow.patient_name);
  if (flow.mode) L.push("Mode: " + flow.mode);
  if (flow.join_from) L.push("Location: " + flow.join_from);
  if (flow.time_pref) L.push("Preferred time: " + flow.time_pref);
  if (flow.physio_choice) L.push("Physio: " + flow.physio_choice);
  if (flow.condition) L.push("Concern: " + flow.condition);
  if (flow.start_when) L.push("Start: " + flow.start_when);
  if (flow.source) L.push("Heard via: " + flow.source);
  return L.length ? "\u{1F4CB} Booking form submitted\n" + L.join("\n") : "[Booking form submitted]";
}

function sendImageTo(to, link, caption) {
  waSend({
    messaging_product: "whatsapp",
    to: to,
    type: "image",
    image: { link: link, caption: caption || "" }
  }, "qr image", () => sendTextTo(to, "Scan to pay: " + link));
}

// ---- SEND A FILE TO THE PATIENT (prescription, report, invoice) ----
function waUploadMedia(buf, mime, fname, cb) {
  const boundary = "----physiocally" + Date.now();
  const head = Buffer.from(
    "--" + boundary + "\r\nContent-Disposition: form-data; name=\"messaging_product\"\r\n\r\nwhatsapp\r\n" +
    "--" + boundary + "\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\n" + mime + "\r\n" +
    "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + fname + "\"\r\nContent-Type: " + mime + "\r\n\r\n"
  );
  const tail = Buffer.from("\r\n--" + boundary + "--\r\n");
  const body = Buffer.concat([head, buf, tail]);
  const req = https.request({
    hostname: "graph.facebook.com",
    path: "/v20.0/" + PHONE_NUMBER_ID + "/media",
    method: "POST",
    headers: { Authorization: "Bearer " + ACCESS_TOKEN, "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length }
  }, (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => {
      let id = "";
      try { id = JSON.parse(d).id || ""; } catch (e) {}
      if (!id) console.log("media upload failed " + d.slice(0, 300));
      cb(id);
    });
  });
  req.on("error", (e) => { console.log("media upload error " + e); cb(""); });
  req.write(body);
  req.end();
}

function sendFileTo(to, mediaId, mime, fname, caption) {
  const isImg = String(mime).indexOf("image/") === 0;
  const payload = isImg
    ? { messaging_product: "whatsapp", to: to, type: "image", image: { id: mediaId, caption: caption || "" } }
    : { messaging_product: "whatsapp", to: to, type: "document", document: { id: mediaId, filename: fname, caption: caption || "" } };
  waSend(payload, "send file to patient");
}

function lastInboundAt(phone) {
  const a = chats.get(phone) || [];
  for (let i = a.length - 1; i >= 0; i--) if (a[i].d === "in") return a[i].ts;
  return 0;
}

app.post("/inbox/file", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (phone.length < 11) return res.status(400).json({ error: "phone" });
  let buf;
  try { buf = Buffer.from(String(b.data || ""), "base64"); } catch (e) { return res.status(400).json({ error: "could not read the file" }); }
  if (!buf.length) return res.status(400).json({ error: "the file is empty" });
  if (buf.length > 16 * 1024 * 1024) return res.status(400).json({ error: "file too large, keep it under 16 MB" });
  const mime = String(b.mime || "application/pdf");
  const fname = String(b.name || "file").slice(0, 80);
  const caption = String(b.caption || "").slice(0, 900);
  const last = lastInboundAt(phone);
  const hrs = last ? Math.round((Date.now() - last) / 3600000) : 999;
  if (hrs > 23) return res.status(409).json({ error: "window", hours: hrs });
  waUploadMedia(buf, mime, fname, (id) => {
    if (!id) return res.status(502).json({ error: "WhatsApp did not accept the file" });
    sendFileTo(phone, id, mime, fname, caption);
    setHuman(phone, 1);
    storeMediaRetry(phone, fname, mime, buf, () => {});
    res.json({ ok: true });
  });
});

app.post("/inbox/upsell", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (phone.length < 11) return res.status(400).json({ error: "phone" });
  const nm = String(waNames.get(phone) || "there").split(" ")[0];
  sendUpsellButtons(phone, nm);
  res.json({ ok: true });
});

app.post("/inbox/saved", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (phone.length < 11) return res.status(400).json({ error: "phone" });
  if (b.kind === "payment") {
    sendTextTo(phone, TXT_PAYMENT);
    setTimeout(() => sendImageTo(phone, QR_URL, "Physiocally payment QR"), 1500);
    setHuman(phone, 1);
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "unknown kind" });
});


// ---- MEDIA CLASSIFICATION (patient tags it, FDO gets a clear alert) ----
const pendingMedia = new Map();
const lastMedia = new Map();
const patientNames = new Map();

function nameFor(phone) {
  const n = waNames.get(phone);
  return n ? n : "+" + phone;
}

function askMediaType(from, fname, url, kind) {
  pendingMedia.set(from, { fname: fname, url: url, kind: kind, at: Date.now() });
  lastMedia.set(from, { fname: fname, url: url, kind: kind, at: Date.now() });
  waSend({
    messaging_product: "whatsapp",
    to: from,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Thank you! So we can file this correctly, what have you shared?" },
      action: { buttons: [
        { type: "reply", reply: { id: "media_pay", title: "Payment screenshot" } },
        { type: "reply", reply: { id: "media_report", title: "Medical report" } },
        { type: "reply", reply: { id: "media_other", title: "Something else" } }
      ] }
    }
  }, "media type ask", () => mediaAlertNow(from, ""));
  setTimeout(() => { if (pendingMedia.has(from)) mediaAlertNow(from, ""); }, 180000);
}

function mediaAlertNow(from, label) {
  const p = pendingMedia.get(from) || lastMedia.get(from);
  pendingMedia.delete(from);
  const who = nameFor(from);
  const tag = label || "File";
  const link = p && p.url ? " Open: " + p.url : " Please open the Physiocally inbox to view this file.";
  const fn = p && p.fname ? " (" + p.fname + ")" : "";
  sendAlert(tag + " from " + who + ", wa.me/" + from + fn + "." + link);
}

function handleMediaChoice(from, id) {
  if (id === "media_pay") { mediaAlertNow(from, "\u{1F4B0} Payment screenshot"); return sendTextTo(from, "Thank you! Our care team will verify your payment and confirm shortly."); }
  if (id === "media_report") { mediaAlertNow(from, "\u{1F4C4} Medical report"); return sendTextTo(from, "Thank you! Your report is with our team and will be shared with your physiotherapist."); }
  if (id === "media_other") { mediaAlertNow(from, "\u{1F4CE} File"); return sendTextTo(from, "Thank you! Our care team will look at this and reply here."); }
  return false;
}


// ---- ACTION BUTTONS + INTENT ----
const TXT_ADDRESS = "\u{1F4CD} *Physiocally Clinic*\nMahavir Terrace, Dawood Baug Road, Andheri West, Mumbai 400058\n\n\u{1F5FA}️ Directions: https://maps.app.goo.gl/7WcBtf8RHqTF5GiM6\n\nOur team is available *9 AM to 9 PM*.";
const TXT_COVERAGE = "\u{1F3E0} *Home visits across Mumbai*\n\nWe cover *all of Mumbai*. Our physiotherapist comes to you with everything needed for assessment and treatment.\n\n\u{1FA7A} Home visit consultation: *Rs 1499*\nSession charges reduce when a longer treatment plan is needed.\n\nPlease share your area and our care team will confirm the nearest available physio and timing.";
const COVER_WORDS = ["which area", "which areas", "areas do you", "do you cover", "do you come to", "do you visit", "home visit in", "cover my area", "come to my", "service in"];
const ADDR_WORDS = ["address", "location of", "where is", "where are you", "how to reach", "directions", "google map", "maps", "landmark", "which area", "clinic address"];
const BOOK_WORDS = ["book", "appointment", "slot", "schedule", "want to come", "fix a time"];
const MENU_WORDS = ["menu", "options", "start over", "main menu"];

function sendActions(to, text, opts) {
  const btns = [];
  (opts || ["book", "menu"]).forEach((o) => {
    if (o === "book") btns.push({ type: "reply", reply: { id: "act_book", title: "Book a session" } });
    if (o === "addr") btns.push({ type: "reply", reply: { id: "act_addr", title: "Clinic address" } });
    if (o === "menu") btns.push({ type: "reply", reply: { id: "act_menu", title: "Main menu" } });
  });
  waSend({
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: { type: "button", body: { text: String(text).slice(0, 1020) }, action: { buttons: btns } }
  }, "actions", () => sendTextTo(to, text));
}

function checkIntent(from, body) {
  const low = String(body || "").toLowerCase();
  if (COVER_WORDS.some((w) => low.includes(w))) { sendActions(from, TXT_COVERAGE, ["book", "menu"]); return true; }
  if (ADDR_WORDS.some((w) => low.includes(w))) { sendActions(from, TXT_ADDRESS, ["book", "menu"]); return true; }
  if (BOOK_WORDS.some((w) => low.includes(w))) { sendFlow(from); return true; }
  if (MENU_WORDS.some((w) => low.includes(w))) { sendMenu(from); return true; }
  return false;
}


// ---- WHO IS THIS PATIENT ----
const waNames = new Map();
const CC = [["971","UAE"],["966","Saudi Arabia"],["974","Qatar"],["965","Kuwait"],["968","Oman"],["973","Bahrain"],["977","Nepal"],["880","Bangladesh"],["94","Sri Lanka"],["92","Pakistan"],["44","UK"],["61","Australia"],["64","New Zealand"],["65","Singapore"],["60","Malaysia"],["66","Thailand"],["62","Indonesia"],["63","Philippines"],["81","Japan"],["82","South Korea"],["86","China"],["852","Hong Kong"],["49","Germany"],["33","France"],["39","Italy"],["34","Spain"],["31","Netherlands"],["32","Belgium"],["41","Switzerland"],["43","Austria"],["46","Sweden"],["47","Norway"],["45","Denmark"],["358","Finland"],["351","Portugal"],["353","Ireland"],["48","Poland"],["7","Russia"],["90","Turkey"],["27","South Africa"],["254","Kenya"],["255","Tanzania"],["256","Uganda"],["234","Nigeria"],["20","Egypt"],["972","Israel"],["55","Brazil"],["52","Mexico"],["54","Argentina"],["1","USA or Canada"]];
function countryOf(phone) {
  const p = String(phone || "");
  if (p.indexOf("91") === 0 && p.length === 12) return "India";
  for (let i = 0; i < CC.length; i++) if (p.indexOf(CC[i][0]) === 0) return CC[i][1];
  return "International";
}
function whoIs(phone) {
  const nm = waNames.get(phone) || "";
  return { name: nm, country: countryOf(phone) };
}
