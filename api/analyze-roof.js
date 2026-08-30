import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

async function imageUrlToBase64(url) {
  const imageResponse = await fetch(url);

  if (!imageResponse.ok) {
    throw new Error("Unable to download roof photo");
  }

  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await imageResponse.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return {
    mimeType: contentType,
    data: base64
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return response.status(500).json({
      error: "Missing GEMINI_API_KEY"
    });
  }

  try {
    const { customerId, customerName, address, roofPhotoUrls } = request.body || {};

    if (!customerId) {
      return response.status(400).json({ error: "Missing customerId" });
    }

    if (!roofPhotoUrls || roofPhotoUrls.length === 0) {
      return response.status(400).json({ error: "No roof photos found" });
    }

    const selectedPhotoUrls = roofPhotoUrls.slice(0, 5);
    const imageParts = [];

    for (const url of selectedPhotoUrls) {
      const image = await imageUrlToBase64(url);

      imageParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }

    const prompt = buildPrompt({ customerName, address, photoCount: selectedPhotoUrls.length });

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, ...imageParts]
        }
      ]
    });

    const rawText = result.text || "";
    const analysis = parseAnalysisJson(rawText);

    return response.status(200).json({
      analysis,
      raw_response: {
        text: rawText,
        photosAnalyzed: selectedPhotoUrls.length
      },
      model: MODEL,
      photosAnalyzed: selectedPhotoUrls.length
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Unable to analyze roof"
    });
  }
}

function buildPrompt({ customerName, address, photoCount }) {
  return `
You are an experienced photovoltaic site survey assistant working in Cyprus.

Analyze the uploaded roof photos for a photovoltaic sales engineer before the site visit.
Customer: ${customerName || "Unknown"}
Address/location context: ${address || "Unknown"}
Photos provided: ${photoCount}

Base your answer only on what is visible in the photos. If a detail cannot be confirmed from the photos, say so in Greek instead of guessing.

You must evaluate:
- roof type
- roof material
- roof condition
- available usable area
- estimated number of solar panels
- estimated system size in kWp
- shading level
- installation difficulty
- confidence score
- general PV suitability score out of 100
- visible obstacles
- advantages
- recommendations before the site visit

Specifically inspect for:
- solar water heaters
- water tanks
- satellite dishes
- antennas
- air conditioning units
- chimneys
- pipes
- parapets
- rebars
- cables
- roof walls
- trees
- nearby buildings
- shading objects
- access difficulties
- waterproofing concerns
- structural concerns

Rules:
- Return valid JSON only.
- Do not include markdown.
- Do not include text outside JSON.
- JSON keys must remain exactly in English.
- Values shown to the user must be in Greek.
- Use realistic Cyprus residential PV assumptions.
- For estimated_system_kwp, estimate about 0.45 kWp per panel when a panel estimate is possible.
- If the usable roof area is not visible enough, set estimated_panel_count and estimated_system_kwp to 0.
- overall_score and confidence must be numbers from 0 to 100.
- estimated_panel_count must be a number.
- estimated_system_kwp must be a number.

Return exactly this JSON structure:
{
  "overall_score": 0,
  "roof_type": "",
  "roof_material": "",
  "roof_condition": "",
  "available_area": "",
  "estimated_panel_count": 0,
  "estimated_system_kwp": 0,
  "shading_level": "",
  "installation_difficulty": "",
  "confidence": 0,
  "obstacles": [],
  "advantages": [],
  "recommendations": [],
  "summary": ""
}
`;
}

function parseAnalysisJson(rawText) {
  const cleanedText = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleanedText);
  } catch {
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Gemini did not return valid JSON");
    }

    return JSON.parse(jsonMatch[0]);
  }
}
