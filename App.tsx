import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Sparkles, Volume2, Square, Copy, Settings2, Sliders, Bot, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ContentFormat, SearchResult, ContentLength, ContentTone } from './types';
import { generateContentFromTopic, generateSpeech } from './services/geminiService';
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

  // Audio State
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

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
        <div className="max-w-3xl mx-auto text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Agentic Research & Content Generation
          </h2>
          <p className="text-lg text-slate-600">
            Our multi-agent system researches YouTube trends and verifies facts from the web to write your next script, deck, or article.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 p-6 md:p-8 mb-12 border border-white">
          <form onSubmit={handleGenerate} className="space-y-6">
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
              
              {/* Added Search Examples */}
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

            {/* Advanced Options Toggle */}
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
                  
                  {/* Length */}
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

                  {/* Tone */}
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

                  {/* Target Audience */}
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

                  {/* Additional Instructions */}
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

        {/* Error Message */}
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
                  {/* Sources Toggle */}
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
                  {/* Voice Selector */}
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

                  {/* TTS Button */}
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
                    {isGeneratingAudio ? 'Loading Audio...' : isPlaying ? 'Stop Reading' : 'Read Aloud'}
                  </button>

                  <div className="h-4 w-px bg-slate-300 mx-1"></div>
                  
                  {/* Regenerate Button */}
                  <button 
                    onClick={() => handleGenerate()}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-1.5 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>

                  <div className="h-4 w-px bg-slate-300 mx-1"></div>

                  <button 
                    onClick={() => navigator.clipboard.writeText(result.content)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
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
                        <div className="overflow-x-auto my-6 rounded-lg border border-slate-200 shadow-sm">
                          <table className="min-w-full divide-y divide-slate-200" {...props} />
                        </div>
                      ),
                      thead: ({node, ...props}) => (
                        <thead className="bg-slate-100" {...props} />
                      ),
                      tbody: ({node, ...props}) => (
                        <tbody className="bg-white divide-y divide-slate-200" {...props} />
                      ),
                      tr: ({node, ...props}) => (
                        <tr className="hover:bg-slate-50 transition-colors" {...props} />
                      ),
                      th: ({node, ...props}) => (
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200" {...props} />
                      ),
                      td: ({node, ...props}) => (
                        <td className="px-4 py-3 text-sm text-slate-700 leading-relaxed border-b border-slate-100 last:border-0" {...props} />
                      ),
                    }}
                  >
                    {result.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;