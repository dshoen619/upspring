import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Ad, ChatMessage, KeyInsight } from '../types';
import { analyzeAds } from '../services/api';
import './AIChat.css';

interface AIChatProps {
  ads: Ad[];
  brandName: string;
}

const SUGGESTED_QUESTIONS = [
  'What messaging angles are used most?',
  'What patterns do you see across creatives?',
  'What might be working well here, and why?',
  'What CTAs are most common?',
  'How would you describe the brand voice?',
];

export function AIChat({ ads, brandName }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || ads.length === 0) return;

    await askQuestion(input.trim());
    setInput('');
  };

  const askQuestion = async (question: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const response = await analyzeAds(ads, question);

    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response.success
        ? response.answer
        : response.error || 'Sorry, I encountered an error analyzing the ads.',
      timestamp: new Date(),
      keyInsights: response.success ? response.keyInsights : undefined,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  };

  const getCategoryColor = (category: KeyInsight['category']) => {
    const colors = {
      messaging: '#8b5cf6',
      creative: '#ec4899',
      targeting: '#f59e0b',
      performance: '#10b981',
      trend: '#3b82f6',
      general: '#64748b',
    };
    return colors[category] || colors.general;
  };

  if (ads.length === 0) {
    return (
      <div className="ai-chat ai-chat-disabled">
        <div className="chat-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p>Search for a brand to start asking AI questions about their ads</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <h3>Ask AI about {brandName}'s Ads</h3>
        <span className="ads-count">Analyzing {ads.length} ads</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <p>Ask me anything about these ads. For example:</p>
            <div className="suggested-questions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="suggested-question"
                  onClick={() => askQuestion(q)}
                  disabled={isLoading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message message-${msg.role}`}>
                <div className="message-content">
                  <p>{msg.content}</p>
                  {msg.keyInsights && msg.keyInsights.length > 0 && (
                    <div className="key-insights">
                      <h4>Key Insights</h4>
                      <div className="insights-list">
                        {msg.keyInsights.map((insight, i) => (
                          <div key={i} className="insight-item">
                            <span
                              className="insight-category"
                              style={{ backgroundColor: getCategoryColor(insight.category) }}
                            >
                              {insight.category}
                            </span>
                            <span className="insight-text">{insight.insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message message-assistant">
                <div className="message-content message-loading">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about these ads..."
          disabled={isLoading}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="chat-submit"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
