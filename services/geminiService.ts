import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MailAnalysisResult, ClassificationType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are the high-intelligence Mail Classification Assistant for Nishant Dougall.
Your mission: Extract data, route to the correct physical location, and prioritize action.

=== CRITICAL: DATA EXTRACTION ===
1. **UK POSTBOX REFERENCE (ID)**: This is the MOST IMPORTANT field.
   - **Source Priority**: 
     1. Metadata 'filename' (if available).
     2. Document Header/Label (look for "Ref:", "Item:", or 5-7 digit codes).
     3. Barcode Text.
   - **Format**: Strictly numeric (e.g., "502391").
   - **Sanitization**: Remove spaces from OCR'd IDs (e.g., "50 23 91" -> "502391").
   - If not found, use "UNKNOWN_REF".

=== ROUTING LOGIC (STRICT) ===
1. ADDRESS OVERRIDE: 
   - "Flat 5 Old School Court" or "N17 6LY" -> forward_to_oz (AU)
   - "10 Uist Wynd" or "KA7 4GF" or "Ayr" -> forward_to_ayr (UK)
2. NAME FALLBACK (Only if address is missing/unclear):
   - Arvind, Ashima, Molly -> forward_to_ayr
   - Nishant -> forward_to_oz
3. URGENCY FALLBACK:
   - If routing is 'unknown' AND item is a Bill, Tax, or Legal Notice (HIGH/CRITICAL) -> forward_to_ayr
4. DEFAULT: unknown

=== PRIORITY ===
- CRITICAL: PINs, Cards, Legal Docs, ID.
- HIGH: Bills, Tax, Urgent Notice.
- ROUTINE: Statements, General.
- DIGITAL_ONLY: Marketing, Junk.

OUTPUT: Return strictly JSON following the provided schema. Split multi-page PDFs into separate letters if you detect different addressees or senders.
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
          recipient_name: { type: Type.STRING },
          delivery_address: { type: Type.STRING },
          sender: { type: Type.STRING },
          document_type: { type: Type.STRING },
          date_on_document: { type: Type.STRING },
          routing: { type: Type.STRING, enum: ["forward_to_ayr", "forward_to_oz", "unknown"] },
          importance: { type: Type.STRING, enum: ["CRITICAL_FORWARD", "HIGH_FORWARD", "ROUTINE_OPTIONAL", "DIGITAL_ONLY"] },
          auto_action: { type: Type.STRING, enum: ["batch_tag_forward", "archive_digital", "human_review_queue"] },
          reasoning: { type: Type.STRING },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] }
        },
        // Added ukpostbox_ref to required to force AI to attempt extraction
        required: ["ukpostbox_ref", "recipient_name", "delivery_address", "sender", "routing", "importance", "auto_action", "reasoning", "filename"],
      }
    }
  },
  required: ["analysis_results"],
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const analyzeMailItem = async (
    base64Data: string, 
    mimeType: string, 
    metadata?: any,
    onStatusUpdate?: (message: string) => void
): Promise<MailAnalysisResult[]> => {
  const maxRetries = 4;
  let attempt = 0;

  // Supported MIME Check
  if (!mimeType || mimeType.trim() === '') {
      throw new Error("Unknown File Type: The file extension is missing or invalid. Please rename the file with .pdf or .jpg.");
  }

  const supportedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!supportedMimes.includes(mimeType.toLowerCase())) {
    throw new Error(`Unsupported Format: The classifier cannot process "${mimeType}". Please convert to PDF, JPG, or PNG.`);
  }

  while (attempt < maxRetries) {
    try {
      if (onStatusUpdate) {
        onStatusUpdate(attempt === 0 ? "Initiating AI Analysis..." : `Retrying analysis (Attempt ${attempt+1}/${maxRetries})...`);
      }

      // Progress Simulation Milestones
      const statusPhases = [
        "Reading document text and layout...",
        "Searching for Sender and UK Postbox ID...",
        "Evaluating routing rules (Ayr vs Australia)...",
        "Checking for deadlines and urgency...",
        "Finalizing classification metadata..."
      ];
      
      let phaseIdx = 0;
      const phaseInterval = setInterval(() => {
        if (onStatusUpdate && phaseIdx < statusPhases.length) {
          onStatusUpdate(statusPhases[phaseIdx]);
          phaseIdx++;
        }
      }, 4000);

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: `DOCUMENT CONTEXT: ${JSON.stringify(metadata)}\nPlease analyze this mail piece for Nishant Dougall's mailbox. Extract all distinct letters if multi-page.` },
          ],
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: { thinkingBudget: 32768 },
        },
      });

      clearInterval(phaseInterval);

      if (!response.text) {
        throw new Error("Empty Response: The AI processed the file but found no identifiable text. The scan might be blank or too blurry.");
      }

      const parsed = JSON.parse(response.text);
      return (parsed.analysis_results || []).map((result: any) => {
        let classification: ClassificationType = ClassificationType.TBC;
        
        // --- Fallback Routing Logic ---
        // If routing is unknown but it's a High Priority Bill/Tax item, default to Ayr.
        if (result.routing === "unknown" && (result.importance === "HIGH_FORWARD" || result.importance === "CRITICAL_FORWARD")) {
             const lowerDoc = (result.document_type || "").toLowerCase();
             // Broad check for financial/legal urgency terms
             if (lowerDoc.includes('tax') || lowerDoc.includes('bill') || lowerDoc.includes('invoice') || lowerDoc.includes('demand') || lowerDoc.includes('legal') || lowerDoc.includes('notice')) {
                 result.routing = "forward_to_ayr";
                 result.reasoning = (result.reasoning || "") + " [Fallback: High Importance document routed to Ayr]";
             }
        }

        if (result.routing === "forward_to_ayr") classification = ClassificationType.FORWARD_AYR;
        else if (result.routing === "forward_to_oz") classification = ClassificationType.FORWARD_OZ;
        else if (result.auto_action === "archive_digital") classification = ClassificationType.DIGITAL_STORE;
        else if (result.importance === "DIGITAL_ONLY") classification = ClassificationType.SHRED;

        if ((result.importance === "CRITICAL_FORWARD" || result.importance === "HIGH_FORWARD") && 
            classification !== ClassificationType.FORWARD_AYR && classification !== ClassificationType.FORWARD_OZ) {
          classification = ClassificationType.DIGITAL_STORE_ACTION;
        }

        const dateStr = (result.date_on_document || "00000000").replace(/-/g, '');
        const suggestedFilename = `${dateStr} [${result.sender || "Unknown"}] [${result.recipient_name || "Unknown"}]`;

        // --- Robust ID Generation ---
        
        let cleanRef = result.ukpostbox_ref;

        // 1. Sanitize the AI's output
        if (typeof cleanRef === 'number') {
            cleanRef = String(cleanRef);
        }

        if (typeof cleanRef === 'string') {
            // Remove noise characters
            let sanitized = cleanRef.replace(/['"]/g, '').trim();
            
            // Handle split OCR digits (e.g., "12 345")
            // If the string contains only digits and spaces, compact it.
            if (/^[\d\s]+$/.test(sanitized)) {
                const compacted = sanitized.replace(/\s/g, '');
                // Basic validation: UK Postbox IDs are typically 5-7 digits, but let's allow 4-9 to be safe.
                if (compacted.length >= 4 && compacted.length <= 9) {
                    sanitized = compacted;
                }
            }

            const lower = sanitized.toLowerCase();
            if (['null', 'none', 'n/a', 'unknown', '', 'unknown_ref', 'undefined', 'ref', 'id'].includes(lower)) {
                cleanRef = null;
            } else {
                cleanRef = sanitized;
            }
        } else {
            cleanRef = null;
        }

        // 2. Metadata Fallback (Highest Priority for ID)
        // If the file is named "12345.pdf" or "Scan 12345.jpg", we extract that number.
        if (metadata && metadata.filename) {
            const fname = metadata.filename;
            
            // Regex to find sequences of 5 to 9 digits. 
            // UK Postbox IDs are growing, but typically 5 or 6 digits.
            const candidates = fname.match(/\d{5,9}/g);
            
            if (candidates && candidates.length > 0) {
                // Heuristic: Prefer numbers that are 5-7 digits long (standard IDs).
                // Longer numbers might be dates (e.g. 20241012 = 8 digits).
                const bestCandidate = candidates.find(c => c.length >= 5 && c.length <= 7);
                
                if (bestCandidate) {
                    cleanRef = bestCandidate;
                } else {
                    // If no 5-7 digit number, take the first one found (e.g. maybe it is an 8 digit ID or date used as ID).
                    cleanRef = candidates[0];
                }
            }
        }
        
        // 3. Last Resort: Generate Random ID
        const finalItemId = cleanRef || `GEN-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        return {
          itemId: finalItemId,
          classification,
          tag: result.importance,
          addressee: result.recipient_name,
          sender: result.sender,
          originalAddress: result.delivery_address,
          reason: result.reasoning,
          deadline: result.date_on_document || "None",
          suggestedFilename,
          ...result,
          ukpostbox_ref: finalItemId // Ensure the raw ref property in the object also matches the final ID
        };
      });

    } catch (error: any) {
      const status = error?.status;
      const msg = error?.message || "Unknown error";
      const isRateLimit = status === 429 || msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("too many requests");
      
      if ((isRateLimit || status >= 500) && attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 5000 + 3000;
        if (onStatusUpdate) onStatusUpdate(`Server busy. Re-attempting in ${Math.ceil(waitTime/1000)}s...`);
        await delay(waitTime);
        attempt++;
        continue;
      }

      // User-Actionable Error Mapping
      if (status === 400) {
        throw new Error("File Error: The AI cannot read this file. It might be corrupted, password-protected, or zero-bytes. Please convert to a standard PDF or Image.");
      }
      if (status === 429) {
        throw new Error("Traffic Jam: The AI service is experiencing high load. We reached the rate limit. Please wait a moment and retry.");
      }
      if (status >= 500) {
        throw new Error("Service Outage: Google's AI is temporarily unreachable. Please try again in a few minutes.");
      }
      
      throw new Error(msg);
    }
  }
  throw new Error("Analysis Timeout: The AI took too long to respond. The document might be too complex or the service is slow.");
};