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
const websiteSeen = new Set();
let msgSeq = 0;
function nextSeq() { msgSeq += 1; return msgSeq; }
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

const TXT_CLINIC = "🏥 *Consultation at our Andheri West clinic*\n\nTo get you the best results, we offer two starting points:\n\n*Option 1 — Senior Team Assessment: Rs 999*\nA detailed one on one evaluation with our senior physiotherapists, using Dr. Akshay's exact diagnostic framework to find your root cause and build your custom plan.\n🕐 Slots usually available within 24 hours\n\n*Option 2 — Premium Assessment with Dr. Akshay: Rs 3999*\nA one on one evaluation directly with Dr. Akshay.\n🕐 Slots are limited and may require a wait";
const TXT_HOME = "🏠 *Home visit consultation, anywhere in Mumbai*\n\n🩺 Senior Physiotherapist: *Rs 1499*\nSession charges reduce when a longer treatment plan is needed.\n\nOur physio comes to you with everything needed for assessment and treatment. Dr. Akshay personally consults at the clinic and online.";
const TXT_ASK_LOCATION = "🌍 Which city and country will you be in during your session? I will send you the charges and slot options for your time zone right away. 🕐";
const TXT_NOTED = "Noted, thank you. Our care team will keep this in mind while confirming your slot.";
const TXT_ONLINE_INDIA = "💻 *Online video consultation from India*\n\nTo get you the best results, we offer two starting points:\n\n*Option 1 — Senior Team Assessment: Rs 999*\nA detailed one on one evaluation with our senior physiotherapists, using Dr. Akshay's exact diagnostic framework to find your root cause and build your custom plan.\n🕐 Slots usually available within 24 hours\n\n*Option 2 — Premium Assessment with Dr. Akshay: Rs 3499*\nA one on one evaluation directly with Dr. Akshay.\n🕐 Dr. Akshay consults at *1 PM and 6 PM IST*, slots are limited\n\n📱 Sessions run on a video call link we share before your slot, and last *40 to 60 minutes*.";
// ---- INTERNATIONAL RATE CARD ----
const CURRENCY = [
  ["971", "AED", 90, 330], ["966", "SAR", 95, 340], ["974", "QAR", 90, 330],
  ["965", "KWD", 8, 28], ["968", "OMR", 10, 35], ["973", "BHD", 10, 35],
  ["44", "GBP", 20, 70], ["1", "USD", 25, 90], ["61", "AUD", 39, 140],
  ["64", "NZD", 42, 150], ["65", "SGD", 33, 118], ["60", "MYR", 105, 380],
  ["49", "EUR", 22, 80], ["33", "EUR", 22, 80], ["39", "EUR", 22, 80],
  ["34", "EUR", 22, 80], ["31", "EUR", 22, 80], ["32", "EUR", 22, 80],
  ["353", "EUR", 22, 80], ["351", "EUR", 22, 80], ["43", "EUR", 22, 80],
  ["41", "CHF", 22, 80], ["46", "SEK", 260, 940], ["47", "NOK", 270, 970],
  ["45", "DKK", 170, 610], ["27", "ZAR", 460, 1650], ["254", "KES", 3200, 11500],
  ["234", "NGN", 38000, 137000], ["20", "EGP", 1200, 4400], ["972", "ILS", 90, 330],
  ["55", "BRL", 135, 490], ["52", "MXN", 460, 1650], ["1", "USD", 25, 90],
  ["81", "JPY", 3800, 13700], ["82", "KRW", 34000, 122000], ["86", "CNY", 180, 650],
  ["852", "HKD", 195, 700], ["66", "THB", 890, 3200], ["62", "IDR", 410000, 1480000],
  ["63", "PHP", 1450, 5200], ["90", "TRY", 1050, 3800], ["7", "RUB", 2300, 8300]
];
function rateFor(phone) {
  const p = String(phone || "");
  let best = null;
  for (let i = 0; i < CURRENCY.length; i++) {
    const c = CURRENCY[i];
    if (p.indexOf(c[0]) === 0 && (!best || c[0].length > best[0].length)) best = c;
  }
  return best || ["", "USD", 25, 90];
}
function intlRates(phone) {
  const r = rateFor(phone);
  return { cur: r[1], senior: r[2], akshay: r[3] };
}
const TXT_INTL = "🌍 Thank you!\n\nOur care team personally handles bookings outside India. They will message you here with your consultation details, charges and slots that suit your time zone.\n\n🕐 Our team is available *9 AM to 9 PM IST*";
const TXT_PHYSIOS = "👨‍⚕️ *Dr. Akshay Gosavi, Founder of Physiocally*\nMasters in Physiotherapy (MUHS)\n10 years of clinical experience\nExpert in accurately diagnosing the root cause of pain\n\n🩺 *Our Senior Physiotherapists*\nQualified, experienced and experts in diagnosing and treating musculoskeletal pain, rated highly by our patients.\n\n⭐ *Physiocally* has delivered over *1,00,000 sessions* since 2022 with a *4.8 star* Google rating.";
const TXT_ASK_CONDITION = "Tell me what you are dealing with, for example back pain, migraine or knee pain, and I will tell you how physiotherapy can help 💬";

const TXT_FORM_ACK = "Got it, your details are with our team.\n\nWe are checking which physiotherapist and time are free for you. Your exact timing comes next, right here.";
const TXT_UPSELL_PACKS = "To make your treatment more consistent, we have:\n\n📦 *5 Sessions* — Rs 949 per session\n📦 *10 Sessions* — Rs 899 per session\n\n(Advance payment required for package pricing)\n\nPackages help in faster recovery and better results.\n\nWhich one would you like to go ahead with?";
const TXT_UPSELL_NEXT = "A single follow up session is *Rs 999*.\n\nReply here and our care team will schedule your next session at a time that suits you ✅";
const TXT_UPSELL_NO = "No problem! Whenever you are ready, just message us here. Wishing you a speedy recovery 💚";
const COND_CTA = "\n\n📅 Our physio will assess your case and design a plan around it.";
const CONDITIONS = [
  { k: ["tinnitus", "ear ringing", "ringing sound", "ringing in ear", "buzzing ear", "ear noise"], t: "That constant ringing or buzzing, especially noticeable when everything else is quiet, is exhausting in a way that is hard to describe to anyone.\n\nWhen it comes from the neck or jaw, physiotherapy often helps. Our physio will check whether that is the case for you." },
  { k: ["vertigo", "dizzy", "dizziness", "giddiness", "bppv", "balance"], t: "When the room spins as you turn over in bed or sit up too quickly, it is unsettling in a way that is hard to explain to anyone else.\n\nVertigo has several possible causes, and once the right one is identified it is very treatable." },
  { k: ["tmj", "jaw", "jaw pain", "lock jaw", "clicking jaw"], t: "The click when you yawn, the ache while chewing, and the tightness that spreads up the side of your face by evening.\n\nThe jaw rarely works alone, the neck is usually involved too, and it eases well once both are treated." },
  { k: ["migraine", "headache", "head ache"], t: "Many people find their headaches start with tightness in the neck and shoulders, before the head pain even begins.\n\nWhen the neck is part of the problem, treating it can reduce how often the headaches come." },
  { k: ["neck", "cervical"], t: "The stiffness through the day, and the ache that settles in by evening, is something most people put up with far longer than they need to.\n\nNeck pain usually responds well once we understand what is causing it in your case." },
  { k: ["sciatica", "disc", "numbness", "nerve", "leg pain"], t: "When the pain runs down the leg, or the foot goes numb and tingling, the problem is rarely where it hurts. The nerve is being pressed higher up.\n\nThis responds very well without medicines once the pressure is taken off." },
  { k: ["back", "spine", "lumbar"], t: "Whether it is the ache that builds through the day or the catch when you bend to pick something up, back pain is the most common thing we treat and among the most treatable.\n\nMost people improve without medicines." },
  { k: ["knee", "arthritis"], t: "Stairs and standing up after sitting a while are usually when knees make themselves known.\n\nKnee pain responds well to the right strengthening at almost any age, once we see what is going on." },
  { k: ["shoulder", "frozen", "rotator"], t: "When lifting your arm up or reaching behind you becomes something you think about first, and sleeping on that side is hard.\n\nShoulders take time, but they improve well with the right plan." },
  { k: ["surgery", "operation", "post op", "postop", "replacement"], t: "The surgery is done. What happens over the next few months decides how completely you get back to normal.\n\nRecovery works in stages, and a plan built for your specific surgery makes a real difference to where you end up." },
  { k: ["sport", "sprain", "ligament", "acl", "injury"], t: "Getting back is one thing. Not getting injured again is the harder part.\n\nWe build the strength back properly before you return, so you are not caught out by the same thing." },
];
const COND_FALLBACK = "Physiotherapy helps with a wide range of muscle, joint and nerve conditions. Our physio will personally review your case in the consultation and guide you on how much it can help you.";

const INDIA_HINTS = ["india","bharat","mumbai","bombay","delhi","pune","bangalore","bengaluru","hyderabad","chennai","kolkata","calcutta","ahmedabad","jaipur","thane","nagpur","indore","surat","lucknow","goa","kochi","cochin","chandigarh","noida","gurgaon","gurugram","bhopal","patna","kanpur","vadodara","nashik","rajkot","andheri","punjab","ludhiana","amritsar","jalandhar","patiala","mohali","haryana","faridabad","panipat","kerala","trivandrum","thiruvananthapuram","kozhikode","calicut","thrissur","kannur","kollam","alappuzha","tamil","tamilnadu","coimbatore","madurai","trichy","tiruchirappalli","salem","erode","tirupur","vellore","thanjavur","karnataka","mysore","mysuru","mangalore","hubli","belgaum","gulbarga","davangere","shimoga","andhra","telangana","vijayawada","visakhapatnam","vizag","guntur","nellore","tirupati","warangal","karimnagar","nizamabad","rajahmundry","kakinada","maharashtra","aurangabad","solapur","kolhapur","amravati","nanded","sangli","jalgaon","akola","latur","ahmednagar","satara","ratnagiri","dombivli","kalyan","vasai","virar","panvel","borivali","dadar","bandra","malad","goregaon","kandivali","chembur","ghatkopar","powai","worli","colaba","juhu","versova","santacruz","khar","mulund","bhandup","sion","matunga","byculla","wadala","kurla","marol","jogeshwari","dahisar","bhayandar","ulhasnagar","ambernath","badlapur","gujarat","bhavnagar","jamnagar","junagadh","gandhinagar","anand","bharuch","navsari","valsad","vapi","rajasthan","jodhpur","udaipur","kota","ajmer","bikaner","alwar","bhilwara","sikar","varanasi","banaras","agra","meerut","allahabad","prayagraj","bareilly","aligarh","moradabad","saharanpur","gorakhpur","jhansi","mathura","ghaziabad","bihar","gaya","bhagalpur","muzaffarpur","darbhanga","jharkhand","ranchi","jamshedpur","dhanbad","bokaro","bengal","howrah","durgapur","asansol","siliguri","darjeeling","odisha","orissa","bhubaneswar","cuttack","rourkela","puri","berhampur","assam","guwahati","dibrugarh","silchar","jorhat","meghalaya","shillong","manipur","imphal","nagaland","kohima","tripura","agartala","mizoram","aizawl","arunachal","sikkim","gangtok","uttarakhand","dehradun","haridwar","rishikesh","nainital","haldwani","roorkee","himachal","shimla","manali","dharamshala","solan","jammu","kashmir","srinagar","udhampur","leh","ladakh","chhattisgarh","raipur","bilaspur","bhilai","korba","gwalior","jabalpur","ujjain","sagar","rewa","satna","dewas","ratlam","pondicherry","puducherry","andaman","nicobar","daman","diu","silvassa","dadra"];
const FOREIGN_HINTS = ["usa","us","united states","america","american","canada","canadian","uk","united kingdom","england","britain","british","london","scotland","ireland","dubai","uae","abu dhabi","sharjah","ajman","emirates","qatar","doha","kuwait","bahrain","oman","muscat","saudi","riyadh","jeddah","dammam","australia","sydney","melbourne","brisbane","perth","new zealand","auckland","singapore","malaysia","kuala lumpur","indonesia","jakarta","thailand","bangkok","philippines","manila","vietnam","hong kong","japan","tokyo","korea","seoul","china","shanghai","beijing","taiwan","germany","berlin","munich","frankfurt","france","paris","italy","rome","milan","spain","madrid","barcelona","portugal","lisbon","netherlands","amsterdam","belgium","brussels","switzerland","zurich","geneva","austria","vienna","sweden","stockholm","norway","oslo","denmark","copenhagen","finland","poland","warsaw","czech","prague","greece","athens","russia","moscow","turkey","istanbul","israel","tel aviv","south africa","johannesburg","cape town","kenya","nairobi","nigeria","lagos","ghana","tanzania","uganda","ethiopia","egypt","cairo","morocco","brazil","sao paulo","argentina","buenos aires","chile","santiago","colombia","bogota","mexico","peru","lima","nepal","kathmandu","sri lanka","colombo","bangladesh","dhaka","pakistan","karachi","lahore","maldives","bhutan","myanmar","afghanistan","fiji","mauritius","seychelles","luxembourg","iceland","hungary","romania","bulgaria","croatia","serbia","ukraine","kazakhstan","uzbekistan","azerbaijan","armenia","cyprus","malta","jordan","lebanon","iraq","iran","tehran","yemen","syria","libya","tunisia","algeria","sudan","zambia","zimbabwe","botswana","namibia","malawi","rwanda","senegal","cameroon","angola","mozambique"];
const LOCALITY_SUFFIX = ["bazaar","gaon","colony","nagar","pura","puram","wadi","chowk","road","marg","galli","peth","bavi","pally","halli","palya","kunj","vihar","enclave","sector","phase","layout","extension","society","chawl","market"];
const NOT_INDIA_HINTS = ["outside india","not in india","out of india","abroad","overseas","not india","non india","outside of india"];
function placeIsIndia(body, phone) {
  const s = " " + String(body || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim() + " ";
  const w = (a) => a.some((x) => s.indexOf(" " + x + " ") >= 0);
  if (w(NOT_INDIA_HINTS)) return false;
  if (w(INDIA_HINTS)) return true;
  const frn = w(FOREIGN_HINTS);
  if (frn && w(LOCALITY_SUFFIX)) return true;
  if (frn) return false;
  const p = String(phone || "");
  if (p.indexOf("91") === 0 && p.length === 12) return true;
  return false;
}

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
    checkPending();
    const from = msg.from;
    if (msg.type === "interactive") {
      const it = msg.interactive;
      if (it?.type === "nfm_reply") {
        let flow = {};
        try { flow = JSON.parse(it.nfm_reply.response_json); } catch (e) {}
        logChat(from, "in", formSummary(flow));
        noteStep(from, "form_done", String(flow.mode || ""));
        setTimeout(() => sendTextTo(from, TXT_FORM_ACK), 1200);
        if (!sawPrice.has(String(from || ""))) { setTimeout(function () { sendActions(from, TXT_AFTER_FORM, ["charges", "menu"]); }, 1500); }
        if (flow.overall_rating) {
          postToSheet({ type: "feedback", phone: from, case_id: flow.case_id, physio: flow.physio, case_type: flow.case_type, overall_rating: flow.overall_rating, physio_rating: flow.physio_rating, recommend: flow.recommend, improve: flow.improve });
        } else {
          postToSheet({ phone: from, name: flow.patient_name, mode: flow.mode, join_from: flow.join_from, time_pref: flow.time_pref, physio_choice: flow.physio_choice, condition: flow.condition, start_when: flow.start_when, source: "Booking form" });
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
          const tag = exploring ? "[EXPLORING] Booking form" : intl ? "[INTERNATIONAL] Booking form" : "[NEW BOOKING] Booking form";
          const ir = intlRates(from);
          const far = intl && !nearIST(from);
          const ask = exploring ? "They are not ready to book yet. Please send information and keep it warm, do not push for a slot." : intl ? ("Rates: India hours Rs 1499 senior or Rs 3999 with Dr. Akshay. Their local hours " + ir.cur + " " + ir.senior + " senior or " + ir.cur + " " + ir.akshay + " with Dr. Akshay." + (far ? " Their time zone does not overlap our clinic hours, so a Dr. Akshay booking needs his availability confirmed first." : "") + " Ask which city they will be in, then confirm the slot and send a payment link.") : "Please check availability, confirm the slot and share the payment details.";
          sendAlert(tag + ": " + (flow.patient_name || nameFor(from)) + ", wa.me/" + from + ". " + bits.join(", ") + ". " + ask);
          notePending(from, exploring ? "They filled the booking form as just exploring." : intl ? "They filled the booking form from outside India." : "They filled the booking form.", intl);
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
      if (checkIntent(from, body)) { menuLoop.delete(from); return; }
      menuOrHuman(from, body);
      return;
    }
    if (msg.type === "image" || msg.type === "document" || msg.type === "audio" || msg.type === "video") { handleMedia(from, msg); return; }
    menuOrHuman(from, "");
  } catch (e) {
    console.error("handler error:", e);
  }
});

const menuLoop = new Map();
function menuOrHuman(from, body) {
  noteMissed(from, body);
  const n = (menuLoop.get(from) || 0) + 1;
  menuLoop.set(from, n);
  if (n >= 2) {
    menuLoop.delete(from);
    sendTextTo(from, "Let me get a person to help you with this. Our care team will reply here shortly.");
    sendAlert("[NEEDS A PERSON] Bot could not understand " + nameFor(from) + ", wa.me/" + from + ". They said: " + String(body || "a message the bot cannot read").slice(0, 140) + ". Please reply on the clinic chat.");
    setHuman(from, 1);
    notePending(from, "The bot could not understand them.");
    return;
  }
  sendMenu(from);
}

function routeSelection(from, id) {
  menuLoop.delete(from);
  if (id === "menu_charges") { noteStep(from, "charges"); return sendModeButtons(from); }
  if (id === "menu_book") { noteStep(from, "form_open"); return sendFlow(from); }
  if (id === "menu_physios") return sendActions(from, TXT_PHYSIOS, ["book", "menu"]);
  if (id === "menu_condition") { setState(from, "awaiting_condition"); return sendTextTo(from, TXT_ASK_CONDITION); }
  if (id === "mode_clinic") { notePicked(from, "clinic"); return sendActions(from, chargesLead(from) + TXT_CLINIC, ["book", "addr", "menu"]); }
  if (id === "mode_home") { notePicked(from, "home"); return sendActions(from, chargesLead(from) + TXT_HOME, ["book", "menu"]); }
  if (id === "act_book") { noteStep(from, "form_open"); return sendFlow(from); }
  if (id === "act_menu") return sendMenu(from);
  if (id === "act_addr") return sendActions(from, TXT_ADDRESS, ["book", "menu"]);
  if (id === "mode_online") { setState(from, "awaiting_location"); return sendTextTo(from, TXT_ASK_LOCATION); }
  if (id === "upsell_packs") return sendPackButtons(from);
  if (id === "pack5")  { sendFollowupPayLink(from, "pack5");  return true; }
    if (id === "pack10") { sendFollowupPayLink(from, "pack10"); return true; }
    if (id === "upsell_next") return sendSingleButtons(from);
  if (id.indexOf("pick_") === 0) { noteStep(from, "repeat"); return handlePick(from, id); }
  sendMenu(from);
}

const IST_FRIENDLY = ["971", "966", "974", "965", "968", "973", "44", "49", "33", "39", "34", "31", "32", "353", "351", "43", "41", "46", "47", "45", "358", "48", "7", "90", "20", "972", "27", "254", "255", "256", "234", "65", "60", "66", "62", "63", "86", "852", "81", "82", "61", "64", "94", "977", "880", "92"];
function nearIST(phone) {
  const p = String(phone || "");
  return IST_FRIENDLY.some(function (c) { return p.indexOf(c) === 0; });
}

function intlPricingText(phone) {
  const r = intlRates(phone);
  return "\u{1F30D} *Online consultation, wherever you are*\n\n" +
    "Our rates are the same worldwide. What changes is the hour.\n\n" +
    "*During India hours, 9 AM to 9 PM IST*\n" +
    "Senior Physiotherapist: *Rs 1499*\n" +
    "With Dr. Akshay: *Rs 3999*\n\n" +
    "*In your own morning or evening, outside India hours*\n" +
    "Senior Physiotherapist: *" + r.cur + " " + r.senior + "*\n" +
    "With Dr. Akshay: *" + r.cur + " " + r.akshay + "*\n\n" +
    "Your physiotherapist works outside clinic hours for that slot, which is the difference. The consultation itself is identical.\n\n" +
    "Dr. Akshay consults at *1 PM and 6 PM IST*. For a slot outside that, our team checks his availability and confirms before anything is booked.\n\n" +
    "\u{1F4F1} A video call link comes before your slot. Sessions last *40 to 60 minutes*.\n" +
    "\u{1F4B3} Payment by card link in your own currency.";
}
const pickedCountry = new Map();
const FORM_COUNTRY = [
  ["United Arab Emirates", ["uae", "dubai", "abu dhabi", "sharjah", "emirates", "ajman"]],
  ["United States", ["usa", "united states", "america", "new york", "california", "texas", "chicago", "boston", "seattle", "jersey", "florida", "atlanta", "houston", "dallas", "san francisco", "los angeles"]],
  ["United Kingdom", ["uk", "united kingdom", "england", "london", "britain", "scotland", "manchester", "birmingham", "leeds", "glasgow"]],
  ["Canada", ["canada", "toronto", "vancouver", "montreal", "calgary", "ottawa", "brampton"]],
  ["Australia", ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"]],
  ["Singapore", ["singapore"]],
  ["Saudi Arabia", ["saudi", "riyadh", "jeddah", "dammam", "ksa"]],
  ["Qatar", ["qatar", "doha"]],
  ["Kuwait", ["kuwait"]],
  ["Oman", ["oman", "muscat"]],
  ["Germany", ["germany", "berlin", "munich", "frankfurt", "hamburg"]],
  ["India", ["india", "mumbai", "bombay", "delhi", "pune", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata", "ahmedabad", "andheri", "thane", "navi mumbai", "gurgaon", "noida", "jaipur", "surat", "nagpur", "indore", "kochi", "goa"]]
];
function noteCountry(from, body) {
  const low = String(body || "").toLowerCase();
  for (let i = 0; i < FORM_COUNTRY.length; i++) {
    if (FORM_COUNTRY[i][1].some(function (k) { return low.indexOf(k) !== -1; })) {
      pickedCountry.set(from, FORM_COUNTRY[i][0]);
      return;
    }
  }
  pickedCountry.set(from, "Other country");
}
function handleLocation(from, body) {
  noteCountry(from, body);
  const low = body.toLowerCase();
  const isIndia = placeIsIndia(body, from);
  if (isIndia) {
    notePicked(from, "online");
    sendActions(from, chargesLead(from) + TXT_ONLINE_INDIA, ["book", "menu"]);
    postToSheet({ phone: from, name: String(waNames.get(from) || ""), mode: "Online", join_from: body, source: leadSource(from) });
  } else {
    sendActions(from, chargesLead(from) + intlPricingText(from), ["book", "menu"]);
    postToSheet({ phone: from, name: String(waNames.get(from) || ""), mode: "Online", join_from: body, source: leadSource(p) });
    return;
  }
  setState(from, "post_location");
}

const RED_FLAGS = ["bladder", "urine", "incontinen", "saddle numb", "chest pain", "breathless", "cannot move", "can not move", "can't move", "unconscious", "fainted", "accident", "fracture", "broken bone", "fell down", "unable to stand", "cannot stand", "cannot walk", "can't walk"];
const CALLBACK_WORDS = ["call me", "callback", "call back", "phone me", "talk to someone", "speak to someone", "is anyone there", "real person", "human", "insurance", "cashless", "mediclaim", "reimburse", "gst", "corporate", "employees", "hr team", "tie up", "tie-up"];
const JOB_WORDS = ["vacancy", "job", "hiring", "career", "internship", "resume", "cv ", "apply for"];
const TXT_URGENT = "Thank you for sharing this.\n\nWhat you have described needs to be looked at urgently. Our care team will call you shortly to guide you.";
const TXT_CALLBACK = "Our care team will call you shortly on this number.\n\nYou can also reach the clinic directly on *7304181920* (9 AM to 9 PM).";
const TXT_JOBS = "Thank you for your interest in working with Physiocally.\n\nPlease send your CV to *7304181920* and our team will get back to you.";

function checkSpecial(from, body) {
  const low = String(body || "").toLowerCase();
  if (JOB_WORDS.some((w) => low.includes(w))) {
    sendTextTo(from, TXT_JOBS);
    sendAlert("[NON PATIENT] Careers enquiry from wa.me/" + from + ": " + String(body).slice(0, 120));
    setHuman(from, 1);
    notePending(from, "The bot handed this conversation to a person.");
    return true;
  }
  if (RED_FLAGS.some((w) => low.includes(w))) {
    sendTextTo(from, TXT_URGENT);
    sendAlert("[MEDICAL URGENT] Possible red flag symptoms from wa.me/" + from + ". Message: " + String(body).slice(0, 160) + " Please call this patient now.");
    setHuman(from, 1);
    notePending(from, "The bot handed this conversation to a person.");
    return true;
  }
  if (CALLBACK_WORDS.some((w) => low.includes(w))) {
    sendTextTo(from, TXT_CALLBACK);
    sendAlert("[CALLBACK] Requested by wa.me/" + from + ": " + String(body).slice(0, 140) + ". Call them, then use Slot and pay link if they want to book.");
    setHuman(from, 1);
    notePending(from, "The bot handed this conversation to a person.");
    return true;
  }
  return false;
}

const TXT_AFTER_FORM = "While our team checks the calendar, you can see what a session costs.";
const TXT_COMPLEX = "\uD83D\uDE4F Thank you for sharing all of that.\n\nThat is a long time to keep managing this, and when other areas start joining in it usually means the original issue was never fully settled.\n\nThis is treatable. Our physiotherapist will read your full history before your session, so you are not explaining it all over again.";
function handleCondition(from, body) {
  if (checkSpecial(from, body)) return;
  const low = body.toLowerCase();
  const hit = CONDITIONS.find((c) => c.k.some((k) => low.includes(k)));
  if (hit) saidCond.set(String(from || ""), true);
  const lowC = String(body || "").toLowerCase();
  const allHits = CONDITIONS.filter(function (c) { return c.k.some(function (k) { return lowC.indexOf(k) >= 0; }); });
  if (allHits.length >= 2 || lowC.length > 200) {
    saidCond.set(String(from || ""), true);
    noteMissed(from, "COMPLEX " + allHits.length + " conditions | " + String(body || "").slice(0, 300));
    sendAlert("[DETAILED HISTORY] wa.me/" + from + " described " + allHits.length + " areas. The bot has replied and kept the booking open. Read the chat before their session. " + String(body || "").slice(0, 220));
    sendActions(from, TXT_COMPLEX + COND_CTA, ["book", "charges"]);
    return;
  }
  sendActions(from, (hit ? hit.t : COND_FALLBACK) + COND_CTA, ["charges", "book", "menu"]);
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

const greeted = new Set();
const stepSeen = new Map();
function menuIntro(to) {
  noteStep(to, "greeted");
  if (greeted.has(to)) return "What would you like to do next?";
  greeted.add(to);
  return "Namaste from *Physiocally* 🙏\nWe are happy to help you feel better.\n\nTap an option below and I will get you the answer right away 👇";
}

function noteStep(phone, step, mode) {
  postToSheet({ type: "step", phone: String(phone), name: String(waNames.get(String(phone)) || ""), step: step, mode: mode || "" });
}

function noteMissed(phone, text) {
  postToSheet({ type: "missed", phone: String(phone), name: String(waNames.get(String(phone)) || ""), text: String(text || "") });
}
function chargesLead(phone) {
  sawPrice.add(String(phone || ""));
  return saidCond.has(String(phone || "")) ? "\uD83D\uDCAC For what you have described, here is what a first session looks like.\n\n" : "";
}
function sendMenu(to) {
  waSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: menuIntro(to) },
      action: {
        button: "Choose an option",
        sections: [
          {
            title: "Physiocally",
            rows: [
          { id: "menu_condition", title: "What is your concern", description: "Tell us in your own words and we will guide you" },
              { id: "menu_charges", title: "Charges and booking" },
              { id: "menu_book", title: "Book a session" },
              { id: "menu_physios", title: "About our physios" },
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

const pickedMode = new Map();
const MODE_LABEL = { clinic: "At our Andheri West clinic", online: "Online video call", home: "Home visit" };
function notePicked(to, key) { pickedMode.set(to, MODE_LABEL[key] || ""); }

function sendFlow(to) {
  waSend({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Great! 🎉 A few quick details and we will find you a slot." },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: FLOW_ID,
          flow_cta: "Book Your Session",
          flow_action: "navigate",
          flow_action_payload: { screen: "BOOK", data: { prefill_country: String(pickedCountry.get(to) || ""), prefill_mode: String(pickedMode.get(to) || ""), show_country: pickedMode.get(to) !== "At our Andheri West clinic" && pickedMode.get(to) !== "Home visit" } },
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
    const raw = String(b.phone || "").replace(/\D/g, "");
    if (raw.length < 7) return res.status(400).json({ error: "valid phone required" });
    const cc = String(b.country_code || "").replace(/\D/g, "");
    let phone;
    if (cc) phone = raw.indexOf(cc) === 0 && raw.length > 10 ? raw : cc + raw;
    else phone = raw.length === 10 ? "91" + raw : raw;

    const already = websiteSeen.has(phone);
    websiteSeen.add(phone);

    postToSheet({
      phone: phone,
      name: b.name, mode: b.mode, join_from: b.join_from,
      time_pref: b.time_pref, physio_choice: b.physio_choice,
      condition: b.condition, start_when: b.start_when,
      source: "Website",
    });

    const bits = [b.mode, b.condition, b.start_when ? "start " + b.start_when : "", b.time_pref, b.physio_choice, b.join_from ? "joining from " + b.join_from : ""]
      .map(function (x) { return String(x || "").trim(); }).filter(Boolean).join(", ");
    sendAlert("[WEBSITE FORM] " + String(b.name || "No name") + ", wa.me/" + phone + ". " + bits +
      (already ? ". Already enquired via website before." : "") +
      ". They are being sent to WhatsApp now.");

    res.json({ ok: true, phone: phone });
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
const saidCond = new Map();
const sawPrice = new Set();
const igLeads = new Set();
function leadSource(phone) {
  return igLeads.has(String(phone || "")) ? "Instagram Dr Akshay" : "Chat only";
}
const leadLogged = new Set();
function noteLead(phone) {
  const p = String(phone || "");
  if (!p || leadLogged.has(p)) return;
  leadLogged.add(p);
  postToSheet({ phone: p, name: String(waNames.get(p) || ""), source: "Chat only" });
}

function logChat(phone, dir, text) {
  if (!phone) return;
  if (dir === "in") noteLead(phone);
  let a = chats.get(phone);
  if (!a) { a = []; chats.set(phone, a); }
  a.push({ d: dir, t: String(text || "").slice(0, 1000), ts: Date.now(), q: nextSeq() });
  if (a.length > 200) a.splice(0, a.length - 200);
  postToSheet({ type: "chat", phone: phone, dir: dir, text: String(text || "").slice(0, 1500), name: String(waNames.get(phone) || "").slice(0, 40) });
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

function threadFlags(phone) {
  const paid = paidThreads.get(phone);
  const wait = pending.get(phone);
  return {
    paid: paid ? { amount: paid.amount, currency: paid.currency, at: paid.at } : null,
    waiting: wait ? { since: wait.at, what: wait.what } : null
  };
}

app.get("/inbox/data", (req, res) => {
  if (req.query.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  if (!hydrated && chats.size === 0) hydrateChats();
  const threads = [];
  chats.forEach((msgs, phone) => {
    const w = whoIs(phone);
    const f = threadFlags(phone);
    threads.push({ phone: phone, name: w.name, country: w.country, human: isHuman(phone), last: msgs.length ? msgs[msgs.length - 1].ts : 0, paid: f.paid, waiting: f.waiting, msgs: msgs });
  });
  threads.sort((a, b) => {
    const aw = a.waiting ? 1 : 0;
    const bw = b.waiting ? 1 : 0;
    if (aw !== bw) return bw - aw;
    return b.last - a.last;
  });
  res.json({ threads: threads });
});

app.post("/inbox/send", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  const text = String(b.text || "").trim();
  if (phone.length < 11 || !text) return res.status(400).json({ error: "phone and text required" });
  waSend({ messaging_product: "whatsapp", to: phone, type: "text", text: { preview_url: false, body: text } }, "inbox send", () => sendAlert("[DELIVERY FAILED] Reply to wa.me/" + phone + " could not be delivered. The 24 hour chat window may be closed."));
  setHuman(phone, 1);
  clearPending(phone);
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
.b.wait { background:#c62828; }
.b.paid { background:#1b5e20; }
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
      <button onclick="quick('payment')" title="Send bank and UPI details. Use only if the patient cannot pay by link.">Bank details</button>
      <button onclick="quick('slotoffer')" title="Offer a slot with a payment link. This is the normal way to take payment.">Slot and pay link</button>
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
      (t.waiting ? '<span class=\"b wait\">WAITING</span>' : "") +
      (t.paid ? '<span class=\"b paid\">PAID</span>' : "") +
      '<div class="p">' + (t.name ? t.name.replace(/</g, "&lt;") : "+" + t.phone) + '</div>' + '<div class="s" style="color:#7a7a7a">+' + t.phone + (t.country && t.country !== "India" ? ' \u00b7 ' + t.country : '') + '</div><div class="s">' + lastMsg.replace(/</g, "&lt;") + '</div></div>';
  }).join("");
}
function closeChat(){ document.body.classList.remove("chatopen"); }
function openChat(p){ cur = p; document.body.classList.add("chatopen"); const w = document.getElementById("who"); const th = (data.threads || []).find(x => x.phone === p); if (w) w.textContent = (th && th.name ? th.name + "  ·  " : "") + "+" + p + (th && th.country && th.country !== "India" ? "  ·  " + th.country : ""); renderList(); renderChat(); }
function renderChat(){
  const prev = document.getElementById("msgs");
  const stick = !prev || prev.scrollHeight - prev.scrollTop - prev.clientHeight < 60;
  const t = data.threads.find(x => x.phone === cur);
  const el = document.getElementById("msgs");
  const tb = document.getElementById("togglebot");
  if (!t) { el.innerHTML = '<div id="empty">Select a chat</div>'; tb.style.display = "none"; return; }
  tb.style.display = "";
  tb.textContent = t.human ? "Bot: OFF" : "Bot: ON";
  function md(x) { var h = String(x || "").replace(/</g, "&lt;"); return h.replace(new RegExp("https?://[^ \\n<]+", "g"), function(u) { var l = '<a href="' + u + '" target="_blank" style="color:inherit;word-break:break-all">' + u + '</a>'; if (u.indexOf("uc?export=view") !== -1) l += '<a href="' + u + '" target="_blank"><img src="' + u + '" style="max-width:220px;max-height:220px;border-radius:8px;display:block;margin-top:4px"/></a>'; return l; }); }
  el.innerHTML = t.msgs.map(m => '<div class="m ' + (m.d === "in" ? "in" : "out") + '">' + md(m.t) + '<small>' + (m.d === "in" ? 'Patient' : 'Physiocally') + ' &middot; ' + fmt(m.ts) + '</small></div>').join("");
  if (stick) el.scrollTop = el.scrollHeight;
}
async function slotOffer(){
  const who = cur;
  const physio = prompt("Physiotherapist name", "Dr. Akshay");
  if (!physio) return;
  const slot = prompt("Slot, for example Today at 6:00 PM", "");
  if (!slot) return;
  const hold = prompt("Hold the slot until? For example 6 PM today. Leave blank for no hold.", "");
  const tier = prompt("Amount to charge, number only.  Clinic senior 999  ·  Online Dr Akshay 3499  ·  Clinic Dr Akshay 3999  ·  International India hours 1499 senior or 3999 Dr Akshay  ·  International own hours 25 or 90 in their currency", "");
  if (!tier) return;
  const amount = Number(String(tier).replace(/[^0-9.]/g, ""));
  if (!amount) { alert("That is not a number"); return; }
  let money = "INR";
  if (amount <= 500) { money = (prompt("Currency code, for example USD, AED, GBP", "USD") || "").toUpperCase(); if (!money) return; }
  let link = "";
  try {
    const r = await fetch("/inbox/paylink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin, phone: who, amount: amount, currency: money, note: "Physiocally consultation with " + physio }) });
    const j = await r.json();
    link = j.url || "";
    if (!link) alert("Could not create the payment link: " + (j.error || "error") + ". The message is ready, add a link yourself.");
  } catch (e) { alert("Could not reach Razorpay. The message is ready, add a link yourself."); }
  let msg = "Hello! Confirming availability for your request\\n\\n*" + physio + "* has a slot open for you:\\n\\u{1F4C5} *" + slot + "*\\nConsultation fee: *" + (money === "INR" ? "Rs " + amount : money + " " + amount) + "*";
  if (hold) msg += "\\n\\nThis slot is held for you until *" + hold + "*.";
  if (link) msg += "\\n\\n\\u{1F4B3} Pay here to confirm your slot: " + link;
  msg += "\\n\\nShall I confirm this slot for you?";
  document.getElementById("txt").value = msg;
}

async function quick(kind){
  if (!cur) { alert("Open a chat first"); return; }
  if (kind === "slotoffer") { slotOffer(); return; }
  if (kind === "slot") {
    const physio = prompt("Physio name?", "");
    if (!physio) return;
    const slot = prompt("Slot? e.g. Tomorrow 6:00 PM", "");
    if (!slot) return;
    document.getElementById("txt").value = "You are all set. Your session is with *" + physio + "* on *" + slot + "*. Please be ready 5 minutes early. Reply here if you need to reschedule.";
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
        a.push({ d: r[2] === "out" ? "out" : "in", t: String(r[3] || "").slice(0, 1000), ts: Number(r[0]) || Date.now() , q: nextSeq() });
        const nm = String(r[4] || "").trim();
        if (nm) waNames.set(phone, nm.slice(0, 40));
      });
      chats.forEach((a) => { a.sort((x, y) => (x.ts - y.ts) || ((x.q || 0) - (y.q || 0))); if (a.length > 200) a.splice(0, a.length - 200); });
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
function upsellRates(phone) {
  const p = String(phone || "");
  if (p.indexOf("91") === 0 && p.length === 12) return { cur: "Rs", single: 999, five: 949, ten: 899, intl: false };
  if (nearIST(p)) return { cur: "Rs", single: 1499, five: 1399, ten: 1299, intl: true };
  const r = intlRates(p);
  const base = r.senior;
  return { cur: r.cur, single: base, five: Math.round(base * 0.88), ten: Math.round(base * 0.76), intl: true };
}

function money(r, n) { return r.cur === "Rs" ? "Rs " + n : r.cur + " " + n; }

function upsellPacksText(phone) {
  const r = upsellRates(phone);
  return "To make your treatment more consistent, we have:\n\n" +
    "\u{1F4E6} *5 Sessions* \u2014 " + money(r, r.five) + " per session\n" +
    "\u{1F4E6} *10 Sessions* \u2014 " + money(r, r.ten) + " per session\n\n" +
    "Package patients get first pick of slots, so you can hold the same time each week.\n\n" +
    "Which one would you like to go ahead with?";
}

function upsellNextText(phone) {
  const r = upsellRates(phone);
  return "A single follow up session is *" + money(r, r.single) + "*.\n\nTap below and our care team will find you a time that suits you \u2705";
}
function sendPackButtons(to) {
  waSend({
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: upsellPacksText(to) },
      action: { buttons: [
        { type: "reply", reply: { id: "pick_5", title: "5 sessions" } },
        { type: "reply", reply: { id: "pick_10", title: "10 sessions" } },
        { type: "reply", reply: { id: "pick_single", title: "Single session" } }
      ] }
    }
  }, "pack options", () => sendTextTo(to, upsellPacksText(to)));
}

function sendSingleButtons(to) {
  waSend({
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: upsellNextText(to) },
      action: { buttons: [
        { type: "reply", reply: { id: "pick_single", title: "Book my session" } },
        { type: "reply", reply: { id: "upsell_packs", title: "Package options" } }
      ] }
    }
  }, "single option", () => sendTextTo(to, upsellNextText(to)));
}

function handlePick(from, id) {
  const r = upsellRates(from);
  const label = id === "pick_5" ? ("the 5 session package at " + money(r, r.five) + " per session")
    : id === "pick_10" ? ("the 10 session package at " + money(r, r.ten) + " per session")
    : ("a single session at " + money(r, r.single));
  sendTextTo(from, "Thank you! Our care team will confirm your slot and send you a payment link right here shortly.");
  sendAlert("[FOLLOW UP] Confirmed: " + nameFor(from) + " has chosen " + label + ". wa.me/" + from + " Use Slot and pay link to confirm the time and take payment.");
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
  }, "upsell", () => sendAlert("[FOLLOW UP] Could not send the offer could not be delivered to wa.me/" + to + ". Please follow up manually."));
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
const TXT_PAYMENT = "*Bank transfer or UPI*\n\nAccount Name: Physiocally\nAccount Number: 122505002473\nBank Name: ICICI Bank\nBranch: Andheri Veera Desai Road\nIFSC: ICIC0001225\nUPI ID: physiocallyaccount@icici\n\nOnce you have paid, send us the screenshot here so we can match it to your booking.\n\n📍 *Physiocally*, Andheri Veera Desai Road, Mumbai\nhttps://www.physiocally.com";

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
    noteStep(phone, "prescription");
    setHuman(phone, 1);
    clearPending(phone);
    storeMediaRetry(phone, fname, mime, buf, () => {});
    res.json({ ok: true });
  });
});

// ---- NOBODY REPLIED WATCH (45 minutes) ----
const pending = new Map();
const CONSULT_SLOTS = ["13:00", "18:00"];
const CONSULT_LABEL = { "13:00": "1 PM", "18:00": "6 PM" };
const CONSULT_TIMES_TEXT = "1 PM and 6 PM IST";
const PUBLIC_URL = process.env.PUBLIC_URL || "https://whatsapp-webhook-92ev.onrender.com";
const FOLLOWUP = { single: { n: 1, rate: 999 }, pack5: { n: 5, rate: 949 }, pack10: { n: 10, rate: 899 } };

function slotLabel(t) { return CONSULT_LABEL[t] || t; }

function slotDayLabel(ds) {
  const p = String(ds).split("-");
  const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return days[d.getUTCDay()] + " " + d.getUTCDate() + " " + mons[d.getUTCMonth()];
}

function consultPrice(phone, mode) {
  const p = String(phone || "");
  const indian = p.indexOf("91") === 0 && p.length === 12;
  if (indian) return { amount: (mode === "clinic" ? 3999 : 3499), currency: "INR", intl: false };
  const r = rateFor(p);
  return { amount: r[3], currency: r[1], intl: true };
}

function slotsFetch(days, admin, cb) {
  postToSheetCb({ type: admin ? "slots_admin" : "slots", days: days }, function (resp) {
    cb((resp && resp.slots) ? resp.slots : []);
  });
}

function sendFollowupPayLink(phone, which) {
  const f = FOLLOWUP[which];
  if (!f) return;
  const total = f.n * f.rate;
  const label = f.n === 1 ? "1 physiotherapy session" : f.n + " session package at Rs " + f.rate + " each";
  rzpCreateLink(phone, total, "INR", "Physiocally, " + label, function (link) {
    if (!link) {
      sendAlert("[FOLLOW UP] Could not create a pay link for wa.me/" + phone + ". Please send it manually.");
      return;
    }
    sendTextTo(phone, "Here is your payment link for " + label + ".\n\n" + link +
      "\n\nOnce payment is done our team will confirm your session timing with your physiotherapist.");
  }, { followup: which, sessions: String(f.n) });
}
function notePending(phone, what, slow) { pending.set(String(phone), { at: Date.now(), what: what, wait: slow ? 4 * 60 : 45 }); }
function clearPending(phone) { pending.delete(String(phone)); }
function checkPending() {
  const now = Date.now();
  pending.forEach((v, k) => {
    if (now - v.at > (v.wait || 45) * 60 * 1000) {
      pending.delete(k);
      sendAlert("[NO REPLY " + (v.wait || 45) + " MIN] " + nameFor(k) + ", wa.me/" + k + ". " + v.what + " Nobody has replied yet. Please respond now.");
    }
  });
}

app.get("/tick", (req, res) => {
  checkPending();
  res.json({ ok: true, waiting: pending.size });
});

app.post("/nudge", (req, res) => {
  const b = req.body || {};
  if (b.key !== SHEET_KEY) return res.status(403).json({ error: "forbidden" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (phone.length < 11) return res.status(400).json({ error: "valid phone required" });
  waSend({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: "physiocally_book_your_session", language: { code: "en" } } }, "explorer nudge");
  res.json({ ok: true });
});

// ---- RAZORPAY PAYMENT LINKS ----
const crypto = require("crypto");
const RZP_ID = process.env.RAZORPAY_KEY_ID || "";
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RZP_HOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const paidThreads = new Map();
const seenPayments = new Set();

function postToSheetCb(payload, cb) {
  let u;
  try { u = new URL(SHEET_URL); } catch (e) { return cb(null); }
  const body = JSON.stringify(Object.assign({ key: SHEET_KEY }, payload));
  const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
      res.resume();
      https.get(res.headers.location, (r2) => collectJson(r2, cb));
      return;
    }
    collectJson(res, cb);
  });
  req.on("error", () => cb(null));
  req.write(body);
  req.end();
}

function collectJson(res, cb) {
  if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
    res.resume();
    https.get(res.headers.location, (r2) => collectJson(r2, cb));
    return;
  }
  let d = "";
  res.on("data", (c) => (d += c));
  res.on("end", () => { try { cb(JSON.parse(d)); } catch (e) { cb(null); } });
  res.on("error", () => cb(null));
}
function rzpCreateLink(phone, amount, currency, note, cb, extra) {
  if (!RZP_ID || !RZP_SECRET) { console.log("razorpay keys missing"); return cb(""); }
  const payload = JSON.stringify({
    amount: Math.round(Number(amount) * 100),
    currency: currency || "INR",
    accept_partial: false,
    description: String(note || "Physiocally consultation").slice(0, 200),
    customer: { contact: "+" + String(phone) },
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: Object.assign({ patient: String(phone) }, extra || {}),
    callback_method: ""
  });
  const auth = Buffer.from(RZP_ID + ":" + RZP_SECRET).toString("base64");
  const req = https.request({
    hostname: "api.razorpay.com",
    path: "/v1/payment_links",
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
  }, (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => {
      let url = "";
      try { url = JSON.parse(d).short_url || ""; } catch (e) {}
      if (!url) console.log("razorpay link failed " + d.slice(0, 300));
      cb(url);
    });
  });
  req.on("error", (e) => { console.log("razorpay error " + e); cb(""); });
  req.write(payload);
  req.end();
}

app.post("/inbox/paylink", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (phone.length < 11) return res.status(400).json({ error: "phone" });
  const amount = Number(b.amount || 0);
  if (!amount) return res.status(400).json({ error: "amount" });
  rzpCreateLink(phone, amount, b.currency || "INR", b.note, (url) => {
    if (!url) return res.status(502).json({ error: "Razorpay did not create the link" });
    res.json({ ok: true, url: url });
  });
});

app.post("/razorpay", (req, res) => {
  try {
    const body = JSON.stringify(req.body || {});
    if (RZP_HOOK_SECRET) {
      const sig = req.headers["x-razorpay-signature"] || "";
      const mine = crypto.createHmac("sha256", RZP_HOOK_SECRET).update(body).digest("hex");
      if (sig !== mine) { console.log("razorpay signature mismatch"); return res.status(400).json({ error: "signature" }); }
    }
    const e = req.body || {};
    let phone = "";
    let amt = 0;
    let cur = "INR";
    try {
      const pl = e.payload && e.payload.payment_link && e.payload.payment_link.entity;
      const pm = e.payload && e.payload.payment && e.payload.payment.entity;
      const src = pl || pm;
      if (src) {
        amt = Number(src.amount || 0) / 100;
        cur = src.currency || "INR";
        phone = String((src.notes && src.notes.patient) || (src.customer && src.customer.contact) || src.contact || "").replace(/[^0-9]/g, "");
      }
    } catch (err) {}
    let payId = "";
    try {
      const pl2 = e.payload && e.payload.payment_link && e.payload.payment_link.entity;
      const pm2 = e.payload && e.payload.payment && e.payload.payment.entity;
      payId = String((pm2 && pm2.id) || (pl2 && pl2.id) || "");
    } catch (err) {}
    let slotDate = "", slotTime = "", slotMode = "";
        try {
          const sn = src && src.notes ? src.notes : {};
          slotDate = String(sn.slot_date || "");
          slotTime = String(sn.slot_time || "");
          slotMode = String(sn.slot_mode || "");
        } catch (err2) {}
        const dedupe = payId || (phone + ":" + amt);
    if (seenPayments.has(dedupe)) { console.log("duplicate razorpay event ignored " + dedupe); return res.json({ ok: true, duplicate: true }); }
    seenPayments.add(dedupe);
    if (seenPayments.size > 500) { const first = seenPayments.values().next().value; seenPayments.delete(first); }
    if (phone) {
      paidThreads.set(phone, { at: Date.now(), amount: amt, currency: cur });
      noteStep(phone, "paid");
      postToSheetCb({ type: "payment", phone: phone, name: String(waNames.get(phone) || ""), amount: amt, currency: cur, pay_id: payId, note: "Paid on WhatsApp" }, (resp) => {
        const inv = resp && resp.invoice ? String(resp.invoice) : "";
        if (!inv) return;
        waSend({ messaging_product: "whatsapp", to: phone, type: "document", document: { link: inv, filename: "Physiocally invoice.pdf", caption: "Here is your Physiocally invoice. Keep it for your records or for any reimbursement claim." } }, "invoice");
      });
      clearPending(phone);
      logChat(phone, "in", "\u{1F4B0} PAID " + cur + " " + amt + " (confirmed by Razorpay)");
      if (slotDate && slotTime) {
          postToSheetCb({ type: "slot_book", date: slotDate, time: slotTime,
            phone: phone, name: String(waNames.get(phone) || ""), mode: slotMode,
            amount: amt, note: payId }, function (sb) {
            if (sb && !sb.ok) {
              sendAlert("[SLOT CLASH] " + phone + " paid for " + slotDayLabel(slotDate) + " " +
                slotLabel(slotTime) + " but it was already taken. Refund or reschedule needed.");
            }
          });
        }
        if (slotDate && slotTime) {
            sendAlert("[CONSULT BOOKED] " + nameFor(phone) + ", wa.me/" + phone + " paid " + cur + " " + amt +
              " and booked " + slotDayLabel(slotDate) + " at " + slotLabel(slotTime) + " IST. Already confirmed, nothing to do.");
            sendTextTo(phone, "Payment received, thank you. Your consultation with Dr. Akshay is confirmed for " +
              slotDayLabel(slotDate) + " at " + slotLabel(slotTime) + " IST. You will get the video link before the session.");
          } else {
            sendAlert("[PAID] " + nameFor(phone) + ", wa.me/" + phone + " has paid " + cur + " " + amt + ". Please block the slot and confirm the booking.");
            sendTextTo(phone, "Payment received, thank you. Our care team is confirming your slot now and will message you here.");
          }
    }
    res.json({ ok: true });
  } catch (e) { res.json({ ok: true }); }
});
app.post("/inbox/upsell", (req, res) => {
  const b = req.body || {};
  if (b.pin !== INBOX_PIN) return res.status(403).json({ error: "pin" });
  const phone = String(b.phone || "").replace(/[^0-9]/g, "");
  if (phone.length < 11) return res.status(400).json({ error: "phone" });
  const nm = String(waNames.get(phone) || "there").split(" ")[0];
  clearPending(phone);
  noteStep(phone, "upsell");
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
  const recent = lastMedia.get(from);
  if (recent && recent.label && Date.now() - recent.at < 8 * 60 * 1000) {
    lastMedia.set(from, { fname: fname, url: url, kind: kind, at: Date.now(), label: recent.label });
    sendAlert("[FILE] " + recent.label + ", another file from " + nameFor(from) + ", wa.me/" + from + " (" + fname + "). Open: " + (url || "please open the Physiocally inbox"));
    return;
  }
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
  sendAlert("[FILE] " + tag + " from " + who + ", wa.me/" + from + fn + "." + link);
}

function rememberLabel(from, label) {
  const p = lastMedia.get(from);
  if (p) { p.label = label; p.at = Date.now(); lastMedia.set(from, p); }
}

function handleMediaChoice(from, id) {
  if (id === "media_pay") { rememberLabel(from, "\u{1F4B0} Payment screenshot"); mediaAlertNow(from, "\u{1F4B0} Payment screenshot"); return sendTextTo(from, "Received, thank you. Our care team will check this against your booking and confirm your slot."); }
  if (id === "media_report") { rememberLabel(from, "\u{1F4C4} Medical report"); mediaAlertNow(from, "\u{1F4C4} Medical report"); return sendTextTo(from, "Received. Your physiotherapist will go through this before your session, so you will not have to explain it all again. Send the other pages here if there are more."); }
  if (id === "media_other") { rememberLabel(from, "\u{1F4CE} File"); mediaAlertNow(from, "\u{1F4CE} File"); return sendTextTo(from, "Received. Our care team will look at this and reply here."); }
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

const AKSHAY_WORDS = ["dr.akshay", "dr. akshay", "dr akshay", "drakshay", "akshay gosavi", "with akshay", "doctor akshay", "akshay sir"];
const TXT_AKSHAY = "Namaste \u{1F64F}\n\nYes, you can book directly with *Dr. Akshay*.\n\n\u{1F468}\u200D\u2695\uFE0F *Consultation with Dr. Akshay*\nAt our Andheri West clinic: *Rs 3999*\nOnline video call: *Rs 3499*\n\nA one on one evaluation with him, 40 to 60 minutes.\n\u{1F550} He consults at *1 PM and 6 PM IST*, so slots are limited.\n\nIf you would rather start sooner, our senior physiotherapists use the same diagnostic framework and usually have slots within 24 hours at *Rs 999*.";

function firstTouch(to) {
  if (greeted.has(to)) return false;
  greeted.add(to);
  return true;
}

function wantsAkshay(body) {
  const low = String(body || "").toLowerCase();
  return AKSHAY_WORDS.some(function (w) { return low.indexOf(w) !== -1; });
}
function checkIntent(from, body) {
  const low = String(body || "").toLowerCase();
  if (wantsAkshay(body)) {
    igLeads.add(String(from || ""));
    if (firstTouch(from)) {
      noteStep(from, "greeted");
      sendTextTo(from, "Namaste \u{1F64F}\n\nYes, *Dr. Akshay* consults personally at our Andheri West clinic and on video call.\n\nBefore we book, have a quick look at what we do and what it costs \u{1F447}");
      setTimeout(function () { sendMenu(from); }, 1200);
      return true;
    }
    noteStep(from, "charges");
    const bookUrl = PUBLIC_URL + "/book?m=online&p=" + encodeURIComponent(from);
      sendActions(from, TXT_AKSHAY + "\n\nPick a time that suits you here:\n" + bookUrl, ["book", "menu"]);
    return true;
  }
  if (firstTouch(from) && BOOK_WORDS.some((w) => low.includes(w))) {
    noteStep(from, "greeted");
    sendMenu(from);
    return true;
  }
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


// ===== Consult booking pages =====
app.get("/book", (req, res) => {
  const phone = String(req.query.p || "").replace(/\D/g, "");
  const mode = String(req.query.m || "online").toLowerCase() === "clinic" ? "clinic" : "online";
  const pr = consultPrice(phone, mode);
  slotsFetch(7, false, function (slots) {
    const byDate = {};
    slots.forEach(function (s) { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
    let rows = "";
    Object.keys(byDate).sort().forEach(function (d) {
      let cells = "";
      byDate[d].forEach(function (s) {
        if (s.state === "open") {
          cells += '<a class="slot open" href="/book/pay?d=' + encodeURIComponent(s.date) +
            '&t=' + encodeURIComponent(s.time) + '&m=' + mode + '&p=' + encodeURIComponent(phone) +
            '">' + slotLabel(s.time) + '</a>';
        } else {
          cells += '<span class="slot taken">' + slotLabel(s.time) + ' &middot; Booked</span>';
        }
      });
      rows += '<div class="row"><div class="day">' + slotDayLabel(d) + '</div><div class="cells">' + cells + '</div></div>';
    });
    if (!rows) rows = '<p class="none">No slots open in the next 7 days. Message us on WhatsApp and we will find you a time.</p>';
    const extra = pr.intl
      ? '<p class="foot">These times not workable where you are? <a href="/book/request?p=' + encodeURIComponent(phone) + '">Tell us what suits you</a>.</p>'
      : "";
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Book with Dr. Akshay Gosavi</title><style>' +
      'body{font-family:Segoe UI,system-ui,Arial,sans-serif;background:#FAFAF5;color:#222;margin:0;padding:20px 16px;}' +
      '.wrap{max-width:520px;margin:0 auto;}h1{font-size:20px;color:#1E4D2B;margin:0 0 4px;}' +
      '.sub{font-size:14px;color:#666;margin:0 0 18px;}' +
      '.row{display:flex;align-items:center;gap:12px;margin-bottom:10px;}' +
      '.day{width:86px;font-size:14px;color:#555;flex:none;}' +
      '.cells{display:flex;gap:8px;flex:1;}' +
      '.slot{flex:1;text-align:center;padding:14px 8px;border-radius:10px;font-size:16px;text-decoration:none;}' +
      '.open{background:#fff;border:1px solid #1E4D2B;color:#1E4D2B;font-weight:600;}' +
      '.taken{background:#EFEFEA;color:#999;}' +
      '.none{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;font-size:14px;}' +
      '.foot{font-size:12px;color:#888;margin-top:18px;line-height:1.6;}' +
      '</style></head><body><div class="wrap">' +
      '<h1>Consultation with Dr. Akshay Gosavi</h1>' +
      '<p class="sub">' + (mode === "clinic" ? "At the Andheri West clinic" : "Online video call") +
      ' &middot; ' + pr.currency + ' ' + pr.amount + ' &middot; 40 to 60 minutes</p>' + rows + extra +
      '<p class="foot">All times are India Standard Time. Your slot is confirmed as soon as payment is done.</p>' +
      '</div></body></html>');
  });
});

app.get("/book/pay", (req, res) => {
  const date = String(req.query.d || "");
  const time = String(req.query.t || "");
  const mode = String(req.query.m || "online").toLowerCase() === "clinic" ? "clinic" : "online";
  const phone = String(req.query.p || "").replace(/\D/g, "");
  const pr = consultPrice(phone, mode);
  function fail(msg) {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
      '<body style="font-family:Segoe UI,system-ui,Arial,sans-serif;background:#FAFAF5;padding:28px 18px;color:#222;">' +
      '<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:20px;">' +
      '<p style="margin:0 0 14px;font-size:15px;">' + msg + '</p>' +
      '<a href="/book?m=' + mode + '&p=' + encodeURIComponent(phone) +
      '" style="display:inline-block;background:#1E4D2B;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-size:15px;">See other times</a>' +
      '</div></body></html>');
  }
  if (!date || !time) return fail("That link is incomplete. Please pick a time again.");
  if (!phone || phone.length < 7) return fail("We could not identify your number. Please book from the WhatsApp link we sent you.");
  postToSheetCb({ type: "slot_lock", date: date, time: time, phone: phone }, function (lr) {
    if (!lr || !lr.ok) {
      const why = lr && lr.reason;
      if (why === "past") return fail("That time has already passed.");
      if (why === "sunday") return fail("Dr. Akshay does not consult on Sundays.");
      return fail("Sorry, " + slotDayLabel(date) + " at " + slotLabel(time) + " was just taken.");
    }
    rzpCreateLink(phone, pr.amount, pr.currency,
      "Consultation with Dr. Akshay Gosavi, " + slotDayLabel(date) + " " + slotLabel(time) + " IST",
      function (link) {
        if (!link) return fail("We could not open the payment page. Please message us on WhatsApp.");
        res.redirect(link);
      },
      { slot_date: date, slot_time: time, slot_mode: mode });
  });
});

app.get("/cal", (req, res) => {
  if (String(req.query.pin || "") !== String(INBOX_PIN || "")) {
    return res.status(401).send("Physiocally calendar. Open with /cal?pin=YOURPIN");
  }
  const pin = String(req.query.pin || "");
  slotsFetch(14, true, function (slots) {
    const byDate = {};
    slots.forEach(function (s) { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
    let rows = "";
    Object.keys(byDate).sort().forEach(function (d) {
      let cells = "";
      byDate[d].forEach(function (s) {
        const who = s.phone ? String(s.phone).slice(-4) : "";
        if (s.state === "booked") {
          cells += '<div class="c booked"><b>' + slotLabel(s.time) + '</b><span>Booked</span><span>' + s.caseId + '</span></div>';
        } else if (s.state === "blocked") {
          cells += '<div class="c blocked"><b>' + slotLabel(s.time) + '</b><span>Blocked</span>' +
            '<a href="#" onclick="return blk(&quot;' + s.date + '&quot;,&quot;' + s.time + '&quot;,0)">Unblock</a></div>';
        } else if (s.state === "locked") {
          cells += '<div class="c locked"><b>' + slotLabel(s.time) + '</b><span>Paying now</span><span>' + who + '</span></div>';
        } else {
          cells += '<div class="c open"><b>' + slotLabel(s.time) + '</b><span>Open</span>' +
            '<a href="#" onclick="return blk(&quot;' + s.date + '&quot;,&quot;' + s.time + '&quot;,1)">Block</a></div>';
        }
      });
      rows += '<div class="r"><div class="d">' + slotDayLabel(d) + '</div><div class="cs">' + cells + '</div></div>';
    });
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Consult calendar</title><style>' +
      'body{font-family:Segoe UI,system-ui,Arial,sans-serif;background:#FAFAF5;margin:0;padding:16px;color:#222;}' +
      '.wrap{max-width:560px;margin:0 auto;}h1{font-size:18px;color:#1E4D2B;margin:0 0 14px;}' +
      '.r{display:flex;gap:10px;margin-bottom:8px;}' +
      '.d{width:84px;font-size:13px;color:#555;padding-top:12px;flex:none;}' +
      '.cs{display:flex;gap:8px;flex:1;}' +
      '.c{flex:1;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:2px;font-size:12px;min-height:58px;}' +
      '.c b{font-size:14px;}' +
      '.open{background:#fff;border:1px solid #cfcfc7;}' +
      '.booked{background:#E1F5EE;color:#0F6E56;}' +
      '.locked{background:#FAEEDA;color:#854F0B;}' +
      '.blocked{background:#EFEFEA;color:#777;}' +
      '.c a{color:#1E4D2B;font-size:12px;margin-top:auto;}' +
      '</style></head><body><div class="wrap"><h1>Dr. Akshay consult calendar</h1>' + rows +
      '<script>function blk(d,t,on){fetch("/cal/block?pin=' + pin +
      '&d="+encodeURIComponent(d)+"&t="+encodeURIComponent(t)+"&on="+on)' +
      '.then(function(r){return r.json()}).then(function(j){if(j&&j.ok){location.reload()}else{alert("Could not change that slot.")}});return false;}<\/script>' +
      '</div></body></html>');
  });
});

app.get("/cal/block", (req, res) => {
  if (String(req.query.pin || "") !== String(INBOX_PIN || "")) return res.status(401).json({ ok: false });
  postToSheetCb({ type: "slot_block", date: String(req.query.d || ""), time: String(req.query.t || ""),
    on: String(req.query.on || "1") === "1", note: "" }, function (r) { res.json(r || { ok: false }); });
});
