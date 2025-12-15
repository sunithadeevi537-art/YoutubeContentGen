import React from 'react';
import { VideoSource } from '../types';
import { Youtube, ExternalLink, Globe, BookOpen } from 'lucide-react';

interface VideoListProps {
  videos: VideoSource[];
}

const VideoList: React.FC<VideoListProps> = ({ videos }) => {
  if (videos.length === 0) return null;

  // Helper to detect YouTube sources based on URI or Title
  const isYoutube = (v: VideoSource) => {
      const lowerUri = v.uri.toLowerCase();
      const lowerTitle = v.title.toLowerCase();
      return (
        lowerUri.includes('youtube.com') || 
        lowerUri.includes('youtu.be') || 
        lowerTitle === 'youtube.com' ||
        lowerTitle === 'youtube'
      );
  };

  const youtubeVideos = videos.filter(isYoutube);
  const otherSources = videos.filter(v => !isYoutube(v));

  // Deduplicate YouTube videos by URI to prevent identical links
  const uniqueYoutubeVideos = Array.from(
      new Map<string, VideoSource>(youtubeVideos.map((v) => [v.uri, v])).values()
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-indigo-500" />
        Verified Sources & References
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Consolidated YouTube Card */}
        {uniqueYoutubeVideos.length > 0 && (
            <div className="bg-white border border-red-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 col-span-1 flex flex-col h-full">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-red-50">
                    <div className="p-1.5 bg-red-50 rounded-md">
                        <Youtube className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                        <span className="block text-xs font-bold uppercase tracking-wider text-red-600">
                            YouTube Analysis
                        </span>
                        <span className="text-[10px] text-red-400 font-medium">
                            {uniqueYoutubeVideos.length} Source{uniqueYoutubeVideos.length !== 1 ? 's' : ''} Found
                        </span>
                    </div>
                </div>
                <div className="space-y-3 flex-1 overflow-y-auto max-h-60 pr-1 custom-scrollbar">
                    {uniqueYoutubeVideos.map((video, idx) => (
                        <a 
                            key={idx}
                            href={video.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/link flex items-start gap-2 text-sm text-slate-700 hover:text-red-600 transition-colors"
                        >
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-300 group-hover/link:bg-red-500 flex-shrink-0 transition-colors"></span>
                            <span className="line-clamp-2 leading-relaxed text-xs sm:text-sm" title={video.title}>
                                {video.title}
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity ml-auto flex-shrink-0 mt-1" />
                        </a>
                    ))}
                </div>
            </div>
        )}

        {/* Other Sources */}
        {otherSources.map((source, index) => {
          const lowerUri = source.uri.toLowerCase();
          const isWiki = lowerUri.includes('wikipedia.org');
          
          return (
            <a
              key={index}
              href={source.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="group block p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-indigo-200 transition-all duration-200 h-full"
            >
              <div className="flex items-start justify-between h-full">
                <div className="flex-1 pr-3">
                  <div className="flex items-center gap-2 mb-2">
                    {isWiki ? (
                        <BookOpen className="w-3.5 h-3.5 text-slate-700" />
                    ) : (
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isWiki ? 'text-slate-600' : 'text-blue-500'}`}>
                        {isWiki ? 'Wiki' : 'Web'}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-slate-800 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {source.title}
                  </h4>
                  <span className="text-xs text-slate-400 mt-2 block truncate">
                    {new URL(source.uri).hostname}
                  </span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 flex-shrink-0" />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default VideoList;