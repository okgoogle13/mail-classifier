import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MailAnalysisResult, ClassificationType } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
CLASSIFICATION MISSION:
Extract → Route → Prioritize → Automate batch tagging/forwarding to UK Postbox.

=== 1. FIELD EXTRACTION (from PDF + metadata) ===
- ukpostbox_ref: Parse from filename (e.g. "96279" from "96279_080725-01.pdf")
- drive_file_id: Echo input ID (links back to Drive source)
- filename: Echo input filename
- upload_timestamp: Echo input timestamp  
- week_batch_id: Echo input batch ID
- recipient_name: Full name from envelope/content
- delivery_address: Full postal address from envelope
- sender: Sending org/person (e.g. "Nationwide Bank")
- document_type: "bank statement", "PIN letter", etc.
- date_on_document: YYYY-MM-DD from content
- account_or_reference: Account/ref numbers

=== 2. PRIORITIZED ROUTING RULES (STRICT ORDER) ===

RULE 1 (Address Override - HIGHEST PRIORITY):
delivery_address contains "Flat 5 Old School Court" OR "N17 6LY" 
→ routing = "forward_to_oz" (Nishant's London → Australia)

RULE 2 (Parents' Scotland Address):
delivery_address contains "10 Uist Wynd" OR "KA7 4GF" OR "Ayr" 
→ routing = "forward_to_ayr" (parents' locker)

RULE 3 (CONDITIONAL NAME FALLBACK - ONLY if Rules 1-2 fail):
Check recipient_name ONLY after address rules:
- "Arvind Dougall" OR "Ashima Dougall" OR "Molly Dougall" → "forward_to_ayr"
- "Nishant Dougall" → "forward_to_oz"

RULE 4: routing = "unknown" (queue for your app's manual review)

⚠️ ADDRESS ALWAYS OVERRIDES NAME. No exceptions.

=== 3. IMPORTANCE LEVELS ===
CRITICAL_FORWARD: Cards/PINs/legal/IDs (auto-tag "urgent_forward")
HIGH_FORWARD: Bills/tax/urgent (auto-tag "high_forward")  
ROUTINE_OPTIONAL: Statements/updates (batch optional)
DIGITAL_ONLY: Junk/marketing (auto-archive, save postage)

=== 4. AUTOMATION FLAGS ===
- DIGITAL_ONLY → auto_action = "archive_digital" 
- CRITICAL_FORWARD + clear routing → auto_action = "batch_tag_forward"
- Unknown/low confidence → auto_action = "human_review_queue" (your app's review table)

=== 5. JSON OUTPUT ONLY (exact schema for your app) ===
Your response MUST be a JSON object containing a list of analyzed items.
`;

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    analysis_results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ukpostbox_ref: { type: Type.STRING },
          drive_file_id: { type: Type.STRING },
          filename: { type: Type.STRING },
          upload_timestamp: { type: Type.STRING },
          week_batch_id: { type: Type.STRING },
          recipient_name: { type: Type.STRING },
          delivery_address: { type: Type.STRING },
          sender: { type: Type.STRING },
          document_type: { type: Type.STRING },
          date_on_document: { type: Type.STRING, description: "YYYY-MM-DD" },
          account_or_reference: { type: Type.STRING },
          routing: { 
            type: Type.STRING, 
            enum: ["forward_to_ayr", "forward_to_oz", "unknown"] 
          },
          importance: { 
            type: Type.STRING, 
            enum: ["CRITICAL_FORWARD", "HIGH_FORWARD", "ROUTINE_OPTIONAL", "DIGITAL_ONLY"] 
          },
          auto_action: { 
            type: Type.STRING, 
            enum: ["batch_tag_forward", "archive_digital", "human_review_queue"] 
          },
          reasoning: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] }
        },
        required: [
          "recipient_name", 
          "delivery_address", 
          "sender", 
          "routing", 
          "importance", 
          "auto_action", 
          "reasoning",
          "filename"
        ],
      }
    }
  },
  required: ["analysis_results"],
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const analyzeMailItem = async (
    base64Data: string, 
    mimeType: string, 
    metadata?: any,
    onStatusUpdate?: (message: string) => void
): Promise<MailAnalysisResult[]> => {
  const maxRetries = 6;
  let attempt = 0;

  const metadataString = metadata ? JSON.stringify(metadata, null, 2) : "{}";

  while (attempt < maxRetries) {
    try {
      if (onStatusUpdate && attempt > 0) {
        onStatusUpdate(`Retry attempt ${attempt}...`);
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
            {
              text: `METADATA_CONTEXT:
${metadataString}

Analyze this file. Segment it into as many distinct letters as possible. Identify the delivery address for each. Do not skip pages.`,
            },
          ],
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: { thinkingBudget: 32768 },
        },
      });

      if (!response.text) {
        throw new Error("API returned empty response.");
      }

      const parsed = JSON.parse(response.text);
      const results = parsed.analysis_results || [];

      return results.map((result: any) => {
        let classification: ClassificationType;
        
        if (result.routing === "forward_to_ayr") {
            classification = ClassificationType.FORWARD_AYR;
        } else if (result.routing === "forward_to_oz") {
            classification = ClassificationType.FORWARD_OZ;
        } else if (result.auto_action === "archive_digital") {
             classification = ClassificationType.DIGITAL_STORE;
        } else if (result.importance === "DIGITAL_ONLY") {
             classification = ClassificationType.SHRED; 
        } else if (result.auto_action === "human_review_queue" || result.routing === "unknown") {
             classification = ClassificationType.TBC;
        } else {
             classification = ClassificationType.TBC;
        }

        if ((result.importance === "CRITICAL_FORWARD" || result.importance === "HIGH_FORWARD") && classification !== ClassificationType.FORWARD_AYR && classification !== ClassificationType.FORWARD_OZ) {
             classification = ClassificationType.DIGITAL_STORE_ACTION;
        }

        const dateStr = (result.date_on_document || "00000000").replace(/-/g, '');
        let catCode = "TBC";
        if (classification === ClassificationType.FORWARD_AYR) catCode = "FORWARD TO AYR";
        else if (classification === ClassificationType.FORWARD_OZ) catCode = "FORWARD TO AU";
        else if (classification === ClassificationType.DIGITAL_STORE) catCode = "DIGITAL STORE";
        else if (classification === ClassificationType.DIGITAL_STORE_ACTION) catCode = "ACTION REQUIRED";
        else if (classification === ClassificationType.SHRED) catCode = "SHRED";
        
        const suggestedFilename = `${dateStr} [${result.sender || "Unknown"}] [${result.recipient_name || "Unknown"}] [${catCode}]`;

        return {
          itemId: result.ukpostbox_ref || result.account_or_reference || Math.random().toString(36).substr(2, 6),
          classification,
          tag: result.auto_action || result.importance || "No Tag",
          addressee: result.recipient_name || "Unknown",
          sender: result.sender || "Unknown",
          originalAddress: result.delivery_address || "Unknown",
          reason: result.reasoning || "No reasoning provided",
          deadline: result.date_on_document || "None",
          suggestedFilename,
          ukpostbox_ref: result.ukpostbox_ref,
          drive_file_id: result.drive_file_id,
          week_batch_id: result.week_batch_id,
          routing: result.routing,
          importance: result.importance,
          auto_action: result.auto_action,
          document_type: result.document_type,
          account_or_reference: result.account_or_reference,
          confidence: result.confidence
        } as MailAnalysisResult;
      });

    } catch (error: any) {
      const status = error?.status || error?.code || 0;
      const message = error?.message || '';

      const isRateLimit = status === 429 || message.includes('Resource exhausted') || message.includes('429');
      const isServiceUnavailable = status === 503 || status === 500;

      if ((isRateLimit || isServiceUnavailable) && attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        
        if (onStatusUpdate) {
            onStatusUpdate(`API busy. Pausing for ${Math.ceil(waitTime / 1000)}s...`);
        }
        
        await delay(waitTime);
        attempt++;
        continue;
      }

      if (status === 400) throw new Error("Invalid File: The document appears to be corrupted or too large.");
      if (status === 401) throw new Error("Authentication Failed: Check your API Key.");
      if (status === 429) throw new Error("High Traffic: Please wait a moment.");
      
      throw new Error(message || "Analysis failed due to a network error.");
    }
  }
  throw new Error("Analysis failed after multiple retries. The model might be overloaded.");
};