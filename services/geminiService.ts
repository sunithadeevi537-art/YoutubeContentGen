import { GoogleGenAI } from "@google/genai";
import { ContentFormat, SearchResult, GroundingChunk, GenerationOptions, ContentLength } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- AGENT 1: YouTube Research Agent ---
const runYoutubeAgent = async (topic: string): Promise<{ text: string; sources: any[] }> => {
  const prompt = `
    You are a YouTube Trend Researcher. 
    Topic: "${topic}"
    
    Task: Use Google Search to find the LATEST and most popular YouTube videos on this topic.
    IMPORTANT: Prioritize videos uploaded in late 2024 and 2025. Look for "2025" in titles if applicable.
    
    Output:
    - Summarize the key talking points from these recent videos.
    - Identify common angles, viral hooks, and popular opinions expressed in these videos.
    - Extract the video titles and channel names.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  return extractResponseWithSources(response);
};

// --- AGENT 2: News & Web Verification Agent ---
const runNewsAgent = async (topic: string): Promise<{ text: string; sources: any[] }> => {
  const prompt = `
    You are a Fact-Checker and News Researcher.
    Topic: "${topic}"
    
    Task: Use Google Search to find the MOST RECENT news articles, official documentation, and blog posts. 
    IMPORTANT: You MUST specifically look for information dated late 2024 and 2025. Search for "latest updates", "2025 outlook", or "current status".
    
    Output:
    - Verify facts related to the topic with the latest data available.
    - Find specific statistics, dates, or technical details from 2024-2025.
    - Identify any recent controversies or news updates that would make content timely.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] },
  });

  return extractResponseWithSources(response);
};

// --- AGENT 3: Writer/Consolidator Agent ---
const runWriterAgent = async (
  topic: string,
  ytResearch: string,
  newsResearch: string,
  format: ContentFormat,
  options: GenerationOptions
): Promise<string> => {
  
  // Define formatting instructions
  let lengthInstruction = "";
  switch (options.length) {
    case ContentLength.SHORT:
      lengthInstruction = "Keep it concise. Focus on top 3 points. Brief descriptions.";
      break;
    case ContentLength.MEDIUM:
      lengthInstruction = "Standard detail. 5-7 key points. Balance depth with readability.";
      break;
    case ContentLength.LONG:
      lengthInstruction = "Comprehensive deep dive. Detailed examples, nuance, and extensive explanations.";
      break;
  }

  let formatInstruction = "";
  switch (format) {
    case ContentFormat.SCRIPT:
      formatInstruction = `
        Format: YouTube Video Script.
        Structure: Hook (0-30s), Intro, Body (${lengthInstruction}), CTA, Outro.
        Style: Engaging, spoken-word style.
      `;
      break;
    case ContentFormat.PPT:
      formatInstruction = `
        Format: Presentation Slide Deck Outline.
        Structure: Title Slide, Exec Summary, Key Insights Slides (${lengthInstruction}), Conclusion.
        Style: Bullet points, clear headers (##), slide notes.
      `;
      break;
    case ContentFormat.MARKDOWN:
      formatInstruction = `
        Format: Comprehensive Blog Post/Article.
        Structure: Headline, Intro, Core Sections (${lengthInstruction}), Conclusion.
        Style: Well-structured Markdown with headers and paragraphs.
      `;
      break;
  }

  const prompt = `
    You are an Expert Content Creator and Editor.
    
    GOAL: Write content about "${topic}" based ONLY on the provided research intelligence.
    
    --- RESEARCH INTELLIGENCE 1 (YouTube Trends - Latest) ---
    ${ytResearch}
    
    --- RESEARCH INTELLIGENCE 2 (News & Facts - Latest) ---
    ${newsResearch}
    
    --- USER CONFIGURATION ---
    Tone: ${options.tone}
    Target Audience: ${options.targetAudience || 'General'}
    Specific Instructions: ${options.additionalInstructions || 'None'}
    
    --- INSTRUCTIONS ---
    1. Consolidate the "YouTube Trends" and "News/Facts" into a single cohesive piece.
    2. PRIORITIZE 2025 INFORMATION: Ensure the content feels cutting-edge and up-to-date. If there are conflicts, favor the most recent (2025) information.
    3. Use the YouTube trends to ensure the angle is popular/engaging.
    4. Use the News facts to ensure the content is accurate and authoritative.
    5. IMPORTANT: If the research contains ANY financial details (prices, costs, revenue, budgets, savings, market cap, etc.), YOU MUST present these specific details in a Markdown Table to make them easy to compare and understand.
    6. ${formatInstruction}
    7. At the very end, add a "## References" section. Instead of a long flat list, group the sources by type (e.g., "YouTube Analysis" for all video links, and "Web References" for articles).
  `;

  // The Writer agent does NOT need tools, it synthesizes existing research.
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt, 
  });

  return response.text || "Failed to generate content.";
};


// --- ORCHESTRATOR ---
export const generateContentFromTopic = async (
  topic: string, 
  format: ContentFormat,
  options: GenerationOptions,
  onProgress?: (status: string) => void
): Promise<SearchResult> => {
  
  try {
    // Step 1: Parallel Research Agents
    if (onProgress) onProgress("Deploying Research Agents...");
    
    const [ytResult, newsResult] = await Promise.all([
      runYoutubeAgent(topic),
      runNewsAgent(topic)
    ]);

    // Consolidate Sources immediately
    const combinedSources = [...ytResult.sources, ...newsResult.sources];
    const uniqueSources = Array.from(new Map(combinedSources.map(item => [item.uri, item])).values());

    // Step 2: Synthesis Agent
    if (onProgress) onProgress("Synthesizing Content...");
    
    const finalContent = await runWriterAgent(
      topic, 
      ytResult.text, 
      newsResult.text, 
      format, 
      options
    );

    return {
      content: finalContent,
      sources: uniqueSources
    };

  } catch (error: any) {
    console.error("Agent Workflow Error:", error);
    throw mapError(error);
  }
};

// Helper: Extract text and sources from a search-enabled response
const extractResponseWithSources = (response: any) => {
  const text = response.text || "";
  const sources: any[] = [];
  
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[] | undefined;

  if (chunks) {
    chunks.forEach((chunk) => {
      if (chunk.web && chunk.web.uri && chunk.web.title) {
         sources.push({
          title: chunk.web.title,
          uri: chunk.web.uri
        });
      }
    });
  }
  return { text, sources };
};

// Helper: Error Mapping
const mapError = (error: any): Error => {
    let userMessage = "Failed to generate content. Please try again.";
    const errorMsgString = (error.message || error.toString()).toLowerCase();

    if (errorMsgString.includes('401') || errorMsgString.includes('api key')) {
        userMessage = "Authentication failed. Please check your API Key configuration.";
    } else if (errorMsgString.includes('429') || errorMsgString.includes('quota')) {
        userMessage = "Usage limit exceeded. Please try again later.";
    } else if (errorMsgString.includes('safety')) {
        userMessage = "Content generation blocked due to safety policies.";
    }
    
    return new Error(userMessage);
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        throw new Error("No audio data generated");
    }
    return audioData;
  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    throw new Error("Failed to generate speech.");
  }
};