import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Sparkles, Volume2, Square, Copy, Settings2, Sliders, Bot, ChevronDown, ChevronUp, RotateCcw, MessageSquarePlus, Send, Image as ImageIcon, Code, Check, Globe, LogOut, ExternalLink, AlertCircle, Wand2, Images } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ContentFormat, SearchResult, ContentLength, ContentTone } from './types';
import { generateContentFromTopic, generateSpeech, refineContent, generateImage } from './services/geminiService';
import { fetchBlogs, publishPost, Blog } from './services/bloggerService';
import FormatSelector from './components/FormatSelector';
import VideoList from './components/VideoList';

// Helper to decode base64 string to byte array
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert raw PCM data to AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Convert Markdown Content to HTML for Blogger
function convertMarkdownToBloggerHtml(markdown: string): string {
    let html = markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
        .replace(/\*(.*)\*/gim, '<i>$1</i>')
        // Convert Markdown images to HTML tags with base64 source
        .replace(/!\[(.*?)\]\((.*?)\)/gim, '<div class="separator" style="clear: both; text-align: center;"><img alt="$1" src="$2" style="max-width:100%; height:auto; display:block; margin: 20px auto;" /></div>')
        .replace(/\n/gim, '<br />');

    // Clean up placeholder images that weren't generated
    html = html.replace(/src="generate-image"/gim, 'src="" style="display:none;"');
    
    return html;
}

// Component for Image Placeholder
const ImageGeneratorPlaceholder: React.FC<{ 
    alt: string; 
    onImageGenerated: (base64: string) => void;
}> = ({ alt, onImageGenerated }) => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

    const handleGenerate = async () => {
        setStatus('loading');
        try {
            const base64 = await generateImage(alt);
            onImageGenerated(base64);
        } catch (e) {
            setStatus('error');
        }
    };

    return (
        <div className="my-6 p-1 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-100 shadow-sm">
            <div className="bg-white/60 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="p-3 bg-indigo-100 rounded-lg shrink-0">
                    <ImageIcon className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex-1">
                    <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
                        Suggested Visual
                    </h4>
                    <p className="text-sm text-slate-700 font-medium italic">"{alt.replace(/^PROMPT:\s*/i, '')}"</p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={status === 'loading'}
                    className={`
                        shrink-0 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all
                        ${status === 'loading' 
                            ? 'bg-slate-100 text-slate-400 cursor-wait' 
                            : status === 'error'
                                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
                        }
                    `}
                >
                    {status === 'loading' ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Creating...
                        </>
                    ) : status === 'error' ? (
                        <>Retry Generation</>
                    ) : (
                        <>
                            <Sparkles className="w-3.5 h-3.5" />
                            Generate Visual
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

const VOICE_OPTIONS = [
  { id: 'Kore', label: 'Kore (Female)' },
  { id: 'Puck', label: 'Puck (Male)' },
  { id: 'Charon', label: 'Charon (Deep Male)' },
  { id: 'Fenrir', label: 'Fenrir (Intense)' },
  { id: 'Zephyr', label: 'Zephyr (Soft Female)' },
];

const SEARCH_EXAMPLES = [
  "Future of AI 2025",
  "Best Budget Travel Destinations",
  "Healthy Meal Prep for Beginners",
  "Top 10 Tech Gadgets 2024",
  "Mindfulness and Meditation Guide"
];

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<ContentFormat>(ContentFormat.SCRIPT);
  
  // Customization Options State
  const [length, setLength] = useState<ContentLength>(ContentLength.MEDIUM);
  const [tone, setTone] = useState<ContentTone>(ContentTone.PROFESSIONAL);
  const [targetAudience, setTargetAudience] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Initializing Agents...");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [copyStatus, setCopyStatus] = useState(false);

  // Audio State
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);
  
  // Refinement State
  const [refinementText, setRefinementText] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  // Blogger State
  const [showBloggerModal, setShowBloggerModal] = useState(false);
  const [bloggerAccessToken, setBloggerAccessToken] = useState<string | null>(null);
  const [userBlogs, setUserBlogs] = useState<Blog[]>([]);
  const [selectedBlogId, setSelectedBlogId] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessUrl, setPublishSuccessUrl] = useState<string | null>(null);
  const [bloggerError, setBloggerError] = useState<string | null>(null);
  // Allow user to input client ID if not present in environment
  const [customClientId, setCustomClientId] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Batch Image Generation State
  const [isGeneratingAllImages, setIsGeneratingAllImages] = useState(false);
  const [isAddingVisuals, setIsAddingVisuals] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const tokenClientRef = useRef<any>(null);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const initTokenClient = (clientId: string) => {
    const google = (window as any).google;
    if (google?.accounts?.oauth2) {
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/blogger',
            callback: async (tokenResponse: any) => {
                setIsAuthorizing(false);
                if (tokenResponse && tokenResponse.access_token) {
                    setBloggerAccessToken(tokenResponse.access_token);
                    setBloggerError(null);
                    // Fetch blogs immediately
                    try {
                        const blogs = await fetchBlogs(tokenResponse.access_token);
                        setUserBlogs(blogs);
                        if (blogs.length > 0) setSelectedBlogId(blogs[0].id);
                    } catch (err: any) {
                        setBloggerError("Failed to fetch blogs: " + err.message);
                    }
                } else {
                    setBloggerError("Authorization failed.");
                }
            },
        });
        tokenClientRef.current.requestAccessToken();
    } else {
        setIsAuthorizing(false);
        setBloggerError("Google Identity Services not loaded.");
    }
  };

  const handleBloggerAuth = () => {
      setBloggerError(null);
      setIsAuthorizing(true);
      const clientId = customClientId.trim() || process.env.GOOGLE_CLIENT_ID;
      
      if (!clientId) {
          setBloggerError("Please enter a Google Client ID to connect.");
          setIsAuthorizing(false);
          return;
      }
      initTokenClient(clientId);
  };

  const handlePublishToBlogger = async () => {
      if (!selectedBlogId || !result || !bloggerAccessToken) return;
      
      setIsPublishing(true);
      setBloggerError(null);
      
      try {
          // Prepare Title (First H1 or generated topic)
          let postTitle = topic;
          const h1Match = result.content.match(/^# (.*$)/m);
          if (h1Match) {
              postTitle = h1Match[1];
          }

          // Prepare HTML Content
          const htmlContent = convertMarkdownToBloggerHtml(result.content);

          const post = await publishPost(selectedBlogId, postTitle, htmlContent, bloggerAccessToken);
          setPublishSuccessUrl(post.url);
      } catch (err: any) {
          setBloggerError(err.message || "Failed to publish post.");
      } finally {
          setIsPublishing(false);
      }
  };


  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topic.trim()) return;

    setIsLoading(true);
    setLoadingStatus("Deploying Agents...");
    setError(null);
    setResult(null);
    setShowSources(false);
    setShowContent(true);
    // Reset audio state when new content is generated
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
    }
    setIsPlaying(false);

    try {
      const data = await generateContentFromTopic(
        topic, 
        format, 
        {
          length,
          tone,
          targetAudience,
          additionalInstructions
        },
        (status) => setLoadingStatus(status) // Update status callback
      );
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong while researching. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinementText.trim() || !result) return;
    
    setIsRefining(true);
    // Stop audio if playing since content will change
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);

    try {
        const newContent = await refineContent(result.content, refinementText, format);
        setResult(prev => prev ? ({...prev, content: newContent}) : null);
        setRefinementText('');
    } catch (err: any) {
        setError(err.message || "Failed to refine content");
    } finally {
        setIsRefining(false);
    }
  };

  const handleToggleAudio = async () => {
    if (!result?.content) return;

    // If currently playing, stop it
    if (isPlaying) {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    // Start generation/playback
    setIsGeneratingAudio(true);
    setError(null);

    try {
      // 1. Generate Speech with selected voice
      const base64Audio = await generateSpeech(result.content, selectedVoice);
      
      // 2. Initialize Audio Context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 24000 
        });
      }
      const ctx = audioContextRef.current;
      
      // Resume context if suspended (browser policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 3. Decode Audio
      const audioBytes = decode(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, ctx);

      // 4. Play Audio
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      };
      
      source.start(0);
      sourceNodeRef.current = source;
      setIsPlaying(true);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate narration audio.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Replaces the placeholder markdown with the generated image
  const handleImageReplacement = (promptAlt: string, base64Data: string) => {
      setResult(prev => {
          if (!prev) return null;
          
          // Construct the new image markdown
          const newImageMarkdown = `![${promptAlt}](data:image/png;base64,${base64Data})`;
          
          // Find the placeholder using strict match on the specific prompt
          const safeAlt = promptAlt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`!\\[${safeAlt}\\]\\(generate-image\\)`);
          
          const newContent = prev.content.replace(regex, newImageMarkdown);
          
          return {...prev, content: newContent};
      });
  };

  const handleCopyHtmlForBlogger = async () => {
    if (!result) return;
    const html = convertMarkdownToBloggerHtml(result.content);
    try {
        await navigator.clipboard.writeText(html);
        setCopyStatus(true);
        setTimeout(() => setCopyStatus(false), 2000);
    } catch (err) {
        console.error('Failed to copy html');
    }
  };

  // NEW: Generate all images found in content
  const handleGenerateAllImages = async () => {
      if (!result) return;
      setIsGeneratingAllImages(true);
      
      // Find all image placeholders: ![PROMPT: description](generate-image)
      const regex = /!\[(PROMPT:.*?)\]\(generate-image\)/g;
      const matches = [...result.content.matchAll(regex)];
      
      if (matches.length === 0) {
          setIsGeneratingAllImages(false);
          return;
      }

      try {
          // Process sequentially to avoid rate limits
          for (const match of matches) {
              const fullMatch = match[0];
              const altText = match[1];
              
              // Double check if this placeholder still exists (might have been replaced in previous iteration if duplicate prompts exist)
              // But we are updating state in a functional way, so result.content in THIS scope is stale.
              // However, we can just run the generation and try to replace.
              
              try {
                  const base64 = await generateImage(altText);
                  handleImageReplacement(altText, base64);
              } catch (e) {
                  console.error("Failed to generate image for", altText, e);
                  // Continue to next image even if one fails
              }
          }
      } finally {
          setIsGeneratingAllImages(false);
      }
  };

  // NEW: Suggest visuals (add placeholders)
  const handleAddVisuals = async () => {
      if (!result) return;
      setIsAddingVisuals(true);
      try {
          const instruction = "Analyze the content and insert 3-5 relevant image placeholders using the syntax ![PROMPT: <Visual Description>](generate-image) for key sections that would benefit from illustration. Do NOT remove existing content.";
          const newContent = await refineContent(result.content, instruction, format);
          setResult(prev => prev ? ({...prev, content: newContent}) : null);
      } catch (err: any) {
          setError(err.message || "Failed to suggest visuals");
      } finally {
          setIsAddingVisuals(false);
      }
  };

  // Helper to check if content has placeholders
  const hasPlaceholders = result?.content.includes('(generate-image)');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              TubeGenius Agentic AI
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-10">
        {/* ... (Previous Main Content) ... */}
        
        {/* INPUT FORM SECTION */}
        <div className="max-w-3xl mx-auto text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Agentic Research & Content Generation
          </h2>
          <p className="text-lg text-slate-600">
            Our multi-agent system researches YouTube trends and verifies facts from the web to write your next script, deck, or article.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 p-6 md:p-8 mb-12 border border-white">
          <form onSubmit={handleGenerate} className="space-y-6">
            {/* ... (Inputs are unchanged) ... */}
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-slate-700 mb-2">
                What do you want to create content about?
              </label>
              <div className="relative">
                <input
                  id="topic"
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., The Future of AI in Healthcare, Best Pasta Recipes..."
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-lg shadow-sm"
                  disabled={isLoading}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              </div>
              
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Try:</span>
                {SEARCH_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setTopic(example)}
                    disabled={isLoading}
                    className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg border border-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Choose Output Format
              </label>
              <FormatSelector 
                selectedFormat={format} 
                onSelect={setFormat} 
                disabled={isLoading} 
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                <Sliders className="w-4 h-4" />
                {showAdvancedOptions ? 'Hide Customization Options' : 'Customize Output Structure & Tone'}
              </button>

              {showAdvancedOptions && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-slate-50 rounded-xl border border-slate-200 animate-fade-in-down">
                  {/* ... (Advanced options unchanged) ... */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Length & Depth
                    </label>
                    <select
                      value={length}
                      onChange={(e) => setLength(e.target.value as ContentLength)}
                      disabled={isLoading}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      {Object.values(ContentLength).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Tone of Voice
                    </label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as ContentTone)}
                      disabled={isLoading}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      {Object.values(ContentTone).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      placeholder="e.g., Beginners, Medical Professionals, Tech Enthusiasts..."
                      disabled={isLoading}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Additional Instructions (Optional)
                    </label>
                    <textarea
                      value={additionalInstructions}
                      onChange={(e) => setAdditionalInstructions(e.target.value)}
                      placeholder="e.g., Include a Q&A section, focus on budget-friendly options, include a detailed pros/cons list..."
                      disabled={isLoading}
                      rows={2}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !topic.trim()}
              className={`
                w-full py-4 px-6 rounded-xl font-semibold text-white text-lg
                flex items-center justify-center gap-2 transition-all
                ${
                  isLoading || !topic.trim()
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 hover:shadow-xl hover:translate-y-[-1px]'
                }
              `}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {loadingStatus}
                </>
              ) : (
                <>
                  Generate Content
                  <Sparkles className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 mb-8 flex items-center gap-2">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="animate-fade-in-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Results</h2>
              <span className="text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                {format === ContentFormat.SCRIPT ? 'Video Script' : 
                 format === ContentFormat.PPT ? 'Presentation Deck' : 'Blog Post'}
              </span>
            </div>

            {/* Generated Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap gap-4 justify-between items-center">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowContent(!showContent)}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-indigo-600 transition-colors"
                  >
                    {showContent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Generated Output
                  </button>
                  <div className="h-4 w-px bg-slate-300"></div>
                  <button 
                    onClick={() => setShowSources(!showSources)}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    {showSources ? (
                        <>
                            Hide Sources
                            <ChevronUp className="w-3.5 h-3.5" />
                        </>
                    ) : (
                        <>
                            View {result.sources.length} Sources
                            <ChevronDown className="w-3.5 h-3.5" />
                        </>
                    )}
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Suggest/Add Visuals Button */}
                    <button
                        onClick={handleAddVisuals}
                        disabled={isAddingVisuals || isGeneratingAllImages}
                        className={`
                            flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all
                            ${isAddingVisuals 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                            }
                        `}
                    >
                        {isAddingVisuals ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                        {isAddingVisuals ? 'Analyzing...' : 'Auto-Enhance Visuals'}
                    </button>

                    {/* Generate All Images Button (Only if placeholders exist) */}
                    {hasPlaceholders && (
                        <button
                            onClick={handleGenerateAllImages}
                            disabled={isGeneratingAllImages}
                            className={`
                                flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all
                                ${isGeneratingAllImages
                                    ? 'bg-violet-50 border-violet-200 text-violet-600'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600'
                                }
                            `}
                        >
                            {isGeneratingAllImages ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Images className="w-3.5 h-3.5" />}
                            {isGeneratingAllImages ? 'Generating All...' : 'Generate All Images'}
                        </button>
                    )}

                  <div className="h-4 w-px bg-slate-300 mx-1"></div>

                  <div className="relative">
                    <button
                      onClick={() => setShowVoiceOptions(!showVoiceOptions)}
                      disabled={isGeneratingAudio || isPlaying}
                      className={`flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors
                        ${showVoiceOptions ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
                        ${(isGeneratingAudio || isPlaying) ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      {VOICE_OPTIONS.find(v => v.id === selectedVoice)?.label || 'Voice'}
                    </button>

                    {showVoiceOptions && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowVoiceOptions(false)} />
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-20 overflow-hidden">
                          {VOICE_OPTIONS.map((voice) => (
                            <button
                              key={voice.id}
                              onClick={() => {
                                setSelectedVoice(voice.id);
                                setShowVoiceOptions(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-xs font-medium hover:bg-slate-50 flex items-center justify-between
                                ${selectedVoice === voice.id ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}
                              `}
                            >
                              {voice.label}
                              {selectedVoice === voice.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    onClick={handleToggleAudio}
                    disabled={isGeneratingAudio}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${isPlaying 
                        ? 'bg-red-100 text-red-600 hover:bg-red-200 border border-red-200' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm border border-transparent'}
                      ${isGeneratingAudio ? 'opacity-70 cursor-wait' : ''}
                    `}
                  >
                    {isGeneratingAudio ? (
                       <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPlaying ? (
                       <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                       <Volume2 className="w-3.5 h-3.5" />
                    )}
                    {isGeneratingAudio ? 'Loading...' : isPlaying ? 'Stop' : 'Read'}
                  </button>

                  <div className="h-4 w-px bg-slate-300 mx-1"></div>
                  
                  {/* Blogger Publish Button */}
                  <button 
                    onClick={() => setShowBloggerModal(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Publish to Blogger
                  </button>

                   <button 
                    onClick={handleCopyHtmlForBlogger}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    {copyStatus ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Code className="w-3.5 h-3.5" />}
                    HTML
                  </button>
                  
                  <div className="h-4 w-px bg-slate-300 mx-1"></div>

                  <button 
                    onClick={() => handleGenerate()}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-1.5 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button 
                    onClick={() => navigator.clipboard.writeText(result.content)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Collapsible Sources Section */}
              {showSources && (
                 <div className="bg-slate-50/50 p-6 border-b border-slate-200 animate-fade-in-down">
                    <VideoList videos={result.sources} />
                 </div>
              )}

              {/* Collapsible Content Section */}
              {showContent && (
                <div className="p-8 prose prose-slate max-w-none prose-headings:text-slate-800 prose-p:text-slate-600 prose-li:text-slate-600">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({node, ...props}) => (
                        <div className="overflow-x-auto my-8 rounded-xl border border-slate-200 shadow-sm bg-white ring-1 ring-slate-100">
                          <table className="min-w-full divide-y divide-slate-200" {...props} />
                        </div>
                      ),
                      thead: ({node, ...props}) => (
                        <thead className="bg-slate-100" {...props} />
                      ),
                      tbody: ({node, ...props}) => (
                        <tbody className="bg-white divide-y divide-slate-100" {...props} />
                      ),
                      tr: ({node, ...props}) => (
                        <tr className="hover:bg-slate-50/80 transition-colors even:bg-slate-50/40" {...props} />
                      ),
                      th: ({node, ...props}) => (
                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200" {...props} />
                      ),
                      td: ({node, ...props}) => (
                        <td className="px-6 py-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed" {...props} />
                      ),
                      // Custom Image Renderer for Placeholders
                      img: ({node, alt, src, ...props}) => {
                          if (src === 'generate-image') {
                              return (
                                  <ImageGeneratorPlaceholder 
                                      alt={alt || ''} 
                                      onImageGenerated={(base64) => handleImageReplacement(alt || '', base64)} 
                                  />
                              );
                          }
                          return (
                              <div className="my-6 rounded-xl overflow-hidden shadow-sm border border-slate-100">
                                  <img src={src} alt={alt} {...props} className="w-full h-auto object-cover" />
                                  {alt && !alt.startsWith('PROMPT:') && (
                                      <p className="px-4 py-2 bg-slate-50 text-xs text-slate-500 text-center italic border-t border-slate-100">
                                          {alt}
                                      </p>
                                  )}
                              </div>
                          );
                      }
                    }}
                  >
                    {result.content}
                  </ReactMarkdown>

                  {/* Refinement Section */}
                  <div className="mt-8 pt-6 border-t border-slate-200">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <MessageSquarePlus className="w-4 h-4 text-indigo-600" />
                        Refine this result
                    </h4>
                    <form onSubmit={handleRefine} className="relative">
                        <input 
                        type="text"
                        value={refinementText}
                        onChange={(e) => setRefinementText(e.target.value)}
                        placeholder="e.g., Make it funnier, Add more statistics, Shorten the intro..."
                        disabled={isRefining}
                        className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm transition-all"
                        />
                        <button
                        type="submit"
                        disabled={!refinementText.trim() || isRefining}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                        {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Blogger Publishing Modal */}
        {showBloggerModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
                    <div className="px-6 py-4 bg-orange-500 text-white flex justify-between items-center">
                        <h3 className="font-bold flex items-center gap-2">
                            <Globe className="w-5 h-5" />
                            Publish to Blogger
                        </h3>
                        <button onClick={() => setShowBloggerModal(false)} className="hover:bg-orange-600 rounded-full p-1">
                            <ChevronDown className="w-5 h-5 text-white" />
                        </button>
                    </div>
                    
                    <div className="p-6">
                        {publishSuccessUrl ? (
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                    <Check className="w-8 h-8 text-green-600" />
                                </div>
                                <h4 className="text-xl font-bold text-slate-800">Published Successfully!</h4>
                                <p className="text-slate-600 text-sm">Your post is now live on your blog.</p>
                                <a 
                                    href={publishSuccessUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-lg hover:bg-orange-600 font-medium"
                                >
                                    View Post <ExternalLink className="w-4 h-4" />
                                </a>
                                <button 
                                    onClick={() => {
                                        setPublishSuccessUrl(null);
                                        setShowBloggerModal(false);
                                    }}
                                    className="block w-full text-slate-500 hover:text-slate-800 text-sm mt-2"
                                >
                                    Close
                                </button>
                            </div>
                        ) : !bloggerAccessToken ? (
                            <div className="space-y-4">
                                <div className="p-4 bg-blue-50 text-blue-800 rounded-lg text-sm flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <p>To publish directly, you need to authorize this app to access your Blogger account.
                                    <br/><br/>
                                    <strong>Note:</strong> Since this is a client-side demo, you may need to provide your own Google Client ID.</p>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Google Client ID (Optional)</label>
                                    <input 
                                        type="text" 
                                        placeholder="Enter OAuth Client ID..."
                                        value={customClientId}
                                        onChange={(e) => setCustomClientId(e.target.value)}
                                        className="w-full p-2 rounded border border-slate-300 text-sm"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Leave empty if configured in environment.</p>
                                </div>

                                {bloggerError && (
                                    <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                                        {bloggerError}
                                    </div>
                                )}

                                <button 
                                    onClick={handleBloggerAuth}
                                    disabled={isAuthorizing}
                                    className="w-full py-3 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-3 transition-colors"
                                >
                                    {isAuthorizing ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                        <>
                                            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                                            Connect Blogger Account
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Blog</label>
                                    {userBlogs.length > 0 ? (
                                        <select 
                                            value={selectedBlogId} 
                                            onChange={(e) => setSelectedBlogId(e.target.value)}
                                            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none"
                                        >
                                            {userBlogs.map(blog => (
                                                <option key={blog.id} value={blog.id}>{blog.name} ({new URL(blog.url).hostname})</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="text-center py-4 text-slate-500 text-sm">No blogs found on this account.</div>
                                    )}
                                </div>

                                <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
                                    <p className="font-semibold mb-1">Publishing as Draft</p>
                                    <p>The post will be created as a draft. You can review and publish it from your Blogger dashboard.</p>
                                </div>
                                
                                {bloggerError && (
                                    <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                                        {bloggerError}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button 
                                        onClick={() => setBloggerAccessToken(null)}
                                        className="flex-1 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-xl flex items-center justify-center gap-2"
                                    >
                                        <LogOut className="w-4 h-4" /> Disconnect
                                    </button>
                                    <button 
                                        onClick={handlePublishToBlogger}
                                        disabled={isPublishing || !selectedBlogId}
                                        className="flex-[2] py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-orange-200"
                                    >
                                        {isPublishing ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Publishing...
                                            </>
                                        ) : (
                                            <>
                                                Publish Draft
                                                <Send className="w-4 h-4" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;