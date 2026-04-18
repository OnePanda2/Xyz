/**
 * ScrollSense — Step 5: Points System + Bug Fixes
 *
 * What this does:
 *   - Strips any accidental markdown from Gemini's JSON (fixes the sudden crash)
 *   - Saves the Reel to the database
 *   - Increments the user's points by 5
 *   - Replies with the total points confirmation
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { GoogleGenAI } = require('@google/genai');
const pb = require('./pocketbase');

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const PORT = process.env.PORT || 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 

// ─── GEMINI EXTRACTION HELPER ───────────────────────────────────────────────
async function extractReelMetadata(rawMessage) {
  const systemInstruction = `You extract data from social media messages.
Identify if it contains an Instagram Reel or YouTube Short, and extract key metadata.
Always return purely JSON format. If NO link is present, return {}.
Structure:
{
  "platform": "instagram" | "youtube" | null,
  "reel_url": "clean url without tracking",
  "creator_handle": "creator username or null",
  "caption": "message text excluding url",
  "hashtags": ["list", "of", "hashtags"],
  "niche": "infer niche (tech, comedy, finance etc)"
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: rawMessage,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  });

  // BUG FIX: Gemini sometimes wraps JSON in ```json ... ``` despite instructions. 
  // This cleans it before parsing to prevent crashes.
  let rawText = response.text.trim();
  if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json/, '');
  if (rawText.startsWith('```')) rawText = rawText.replace(/^```/, '');
  rawText = rawText.replace(/```$/, '').trim();

  return JSON.parse(rawText);
}


// ─── HEALTH CHECK ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).send('ScrollSense backend is running.');
});


// ─── WEBHOOK RECEIVER ────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  const from = req.body.From || 'unknown';
  const body = req.body.Body ? req.body.Body.trim() : '';
  
  console.log(`\n[WEBHOOK] Message from ${from}: "${body}"`);

  let replyMessage = '';

  try {
    // 1. Check if user exists
    let user = null;
    try {
      user = await pb.collection('users').getFirstListItem(`phone="${from}"`);
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    // 2. Start Onboarding if NEW user
    if (!user) {
      console.log(`[DB] Creating new user profile for ${from}`);
      user = await pb.collection('users').create({
        phone: from,
        onboarding_step: 1,
        points: 0
      });
      replyMessage = "👋 Hi! Welcome to ScrollSense.\n\nTo start logging reels and earning points, please tell me your *Name*.";
    } 
    // 3. Continue Onboarding if incomplete (< 5)
    else if (user.onboarding_step < 5) {
      const step = user.onboarding_step;
      console.log(`[ONBOARDING] User is on step ${step}`);

      if (step === 1) {
        await pb.collection('users').update(user.id, { name: body, onboarding_step: 2 });
        replyMessage = `Nice to meet you, ${body}! Which *City* do you live in?`;
      } 
      else if (step === 2) {
        await pb.collection('users').update(user.id, { city: body, onboarding_step: 3 });
        replyMessage = `Got it. What is your *Age*?`;
      } 
      else if (step === 3) {
        const age = parseInt(body) || 0;
        await pb.collection('users').update(user.id, { age: age, onboarding_step: 4 });
        replyMessage = `Almost done! Lastly, what is your *Profession*?`;
      } 
      else if (step === 4) {
        await pb.collection('users').update(user.id, { profession: body, onboarding_step: 5 });
        replyMessage = `✅ You're all set! Your profile is complete.\n\nJust forward any Instagram Reel or YouTube Short to me to start!`;
      }
    } 
    // 4. Fully Onboarded -> Treat as Reel Forward (Step 5: Points System)
    else {
      console.log("[AI] Analyzing forwarded message...");
      const metadata = await extractReelMetadata(body);
      
      if (!metadata.reel_url && !metadata.platform) {
        replyMessage = "🤔 I couldn't find a valid reel or short in that message. Please try sending a valid link!";
      } else {
        console.log("[DB] Saving extracted reel...");
        
        // Save the Reel
        await pb.collection('reels').create({
          user: user.id,
          raw_message: body,
          reel_url: metadata.reel_url,
          platform: metadata.platform,
          creator_handle: metadata.creator_handle || '',
          caption: metadata.caption || '',
          hashtags: metadata.hashtags || [],
          niche: metadata.niche || 'general'
        });

        // Step 5: The Points System
        const currentPoints = user.points || 0;
        const newPoints = currentPoints + 5;
        
        console.log(`[DB] Incrementing points for user ${user.id} to ${newPoints}`);
        await pb.collection('users').update(user.id, { points: newPoints });

        console.log(`[SUCCESS] Reel saved. Points updated.`);
        replyMessage = `Got it! Reel logged. 🚀\n\nYou've earned 5 points! (Total: ${newPoints})`;
      }
    }
  } catch (err) {
    console.error("[ERROR]", err.message);
    replyMessage = "⚠️ Sorry, there was an unexpected error processing your request. Please try again.";
  }

  // 5. Send instant TwiML XML Reply
  res.set('Content-Type', 'text/xml');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyMessage}</Message>
</Response>`);
});

// ─── RAZORPAY GATEWAY ────────────────────────────────────────────────────
app.post('/create-order', async (req, res) => {
  try {
    const options = {
      amount: process.env.REPORT_PRICE_PAISE || 100, // Default to 1 INR if missing
      currency: 'INR',
      receipt: `receipt_${Date.now()}`
    };
    const order = await razorpay.orders.create(options);
    res.json({ success: true, order_id: order.id, amount: order.amount });
  } catch (error) {
    console.error("[RAZORPAY ERROR]", error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

app.post('/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const digest = hmac.digest('hex');

    if (digest === razorpay_signature) {
      console.log(`[PAYMENT SUCCESS] Order ${razorpay_order_id} verified.`);
      res.json({ success: true });
    } else {
      console.log(`[PAYMENT FAILED] Signature mismatch for ${razorpay_order_id}.`);
      res.status(400).json({ success: false, error: 'Invalid signature' });
    }
  } catch (error) {
    console.error("[RAZORPAY VERIFY ERROR]", error);
    res.status(500).json({ success: false, error: 'Failed to verify payment' });
  }
});

// ─── SERVER START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n[SERVER] ScrollSense backend safely running on port ${PORT}`);
  console.log('[SERVER] Live Onboarding + Reel Webhook active.');
});
