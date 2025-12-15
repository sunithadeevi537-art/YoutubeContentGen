import React from 'react';
import { ContentFormat } from '../types';
import { FileText, MonitorPlay, Presentation } from 'lucide-react';

interface FormatSelectorProps {
  selectedFormat: ContentFormat;
  onSelect: (format: ContentFormat) => void;
  disabled: boolean;
}

const FormatSelector: React.FC<FormatSelectorProps> = ({ selectedFormat, onSelect, disabled }) => {
  const options = [
    { id: ContentFormat.SCRIPT, label: 'Video Script', icon: <MonitorPlay className="w-4 h-4" /> },
    { id: ContentFormat.PPT, label: 'Presentation', icon: <Presentation className="w-4 h-4" /> },
    { id: ContentFormat.MARKDOWN, label: 'Blog Post', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(option.id)}
          disabled={disabled}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
            ${
              selectedFormat === option.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
};

export default FormatSelector;