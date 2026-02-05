'use client';

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useAgent } from '@/hooks/use-agent';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils/ui';
import { Bot, Send, Trash2, Loader2, AlertCircle, Check, X } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: Array<{ name: string; result: { success: boolean; message: string } }>;
}

/**
 * AgentChatbox
 * Chat interface for AI-driven video editing commands
 * Design follows existing panel patterns (PanelBaseView, ScenesView)
 */
export function AgentChatbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [providerStatus, setProviderStatus] = useState<{
    available: boolean;
    provider: string;
  } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const { sendMessage, clearHistory, checkProvider, isProcessing, error } = useAgent();

  // Check provider status on mount
  useEffect(() => {
    checkProvider().then(setProviderStatus);
  }, [checkProvider]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle send message
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    const response = await sendMessage(userMessage.content);

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response.message,
      timestamp: new Date(),
      toolCalls: response.toolCalls,
    };

    setMessages((prev) => [...prev, assistantMessage]);
  };

  // Handle keyboard submit
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle clear
  const handleClear = () => {
    setMessages([]);
    clearHistory();
  };

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Header - matches PanelBaseView sticky header pattern */}
      <div className="bg-panel sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <span className="font-medium text-sm">AI 助手</span>
            {providerStatus && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded-sm',
                  providerStatus.available
                    ? 'bg-constructive/10 text-constructive'
                    : 'bg-destructive/10 text-destructive'
                )}
              >
                {providerStatus.available ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
          <Button
            variant="text"
            size="icon"
            onClick={handleClear}
            disabled={messages.length === 0}
            title="清空对话"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <Separator />
      </div>

      {/* Messages - uses ScrollArea like PanelBaseView */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
              <Bot className="size-10 mb-3 opacity-20" />
              <p>输入指令来控制视频编辑</p>
              <p className="text-xs mt-1 opacity-70">例如: "在当前位置分割视频"</p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isProcessing && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm px-3 py-2">
              <Loader2 className="size-4 animate-spin" />
              <span>处理中...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
              <AlertCircle className="size-4" />
              <span>{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input - follows consistent spacing and border patterns */}
      <div className="bg-panel border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入编辑指令..."
            disabled={isProcessing}
            className={cn(
              'flex-1 min-h-[38px] max-h-[100px] resize-none rounded-md',
              'bg-background border border-border px-3 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            size="icon"
            className="shrink-0 size-[38px]"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Message Bubble Component
 * Uses semantic colors from design system
 */
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-md px-3 py-2 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent text-foreground'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        
        {/* Tool calls display */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/20 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <div
                key={i}
                className={cn(
                  'text-xs flex items-center gap-1.5 px-2 py-1 rounded-sm',
                  tc.result.success
                    ? 'bg-constructive/10 text-constructive'
                    : 'bg-destructive/10 text-destructive'
                )}
              >
                {tc.result.success ? (
                  <Check className="size-3" />
                ) : (
                  <X className="size-3" />
                )}
                <span className="font-mono">{tc.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentChatbox;

