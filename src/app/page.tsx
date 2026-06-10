"use client";

import React, { useRef, useState, useEffect } from "react";

type Message = { role: "user" | "assistant"; text: string };

export default function Home() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const quicks = [
    "How do I apply to BYU–Hawaii?",
    "What scholarships are available?",
    "What housing options are there?",
    "How do I register for classes?",
  ];

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function showToast(text: string, type: "success" | "error" = "success") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function handleQuick(q: string) {
    setQuery(q);
    inputRef.current?.focus();
  }

  function handleNewChat() {
    setMessages([]);
    setQuery("");
    inputRef.current?.focus();
  }

  async function handleSend() {
    const currentQuery = query.trim();
    if (!currentQuery || loading) return;

    setQuery("");
    setLoading(true);
    inputRef.current?.focus();

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", text: currentQuery },
      { role: "assistant", text: "" },
    ];
    setMessages(updatedMessages);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: currentQuery, history: messages }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errorText =
          errorData?.error ||
          `Request failed with status ${res.status}.`;
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              role: "assistant",
              text: errorText,
            };
          }
          return next;
        });
        showToast("Failed to get a reply", "error");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Streaming not supported in this browser.");
      }

      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantText += chunk;
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, text: assistantText };
          } else {
            next.push({ role: "assistant", text: assistantText });
          }
          return next;
        });
      }

      showToast("Reply received", "success");
    } catch (err) {
      console.error("Error sending to /api/chat", err);
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            role: "assistant",
            text: "A network error occurred. Please check your connection and try again.",
          };
        }
        return next;
      });
      showToast("Network error", "error");
    } finally {
      setLoading(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen flex items-start justify-center bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-8">
      <div className="w-full max-w-2xl flex flex-col gap-4">

        {/* Header card */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center justify-center gap-3 w-full mb-4">
              <div className="h-16 w-16 rounded-full bg-[#8b1538] flex items-center justify-center text-white text-xl font-bold shadow-md">
                A
              </div>
              {hasMessages && (
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="ml-auto px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
                >
                  New Chat
                </button>
              )}
            </div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-white mb-1">
              BYU–Hawaii Assistant
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
              Ask me anything about BYU–Hawaii Admissions.
            </p>
          </div>

          {/* Quick prompts — only show when no messages */}
          {!hasMessages && (
            <div className="grid grid-cols-2 gap-3 mt-6">
              {quicks.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleQuick(q)}
                  className="bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl py-3 px-4 text-sm text-left text-zinc-700 dark:text-zinc-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages area */}
        {hasMessages && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-4 flex flex-col gap-3 max-h-[480px] overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-[#8b1538] flex items-center justify-center text-white text-xs font-bold mr-2 mt-0.5 shrink-0">
                    BH
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[#8b1538] text-white rounded-br-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-[#8b1538] flex items-center justify-center text-white text-xs font-bold mr-2 shrink-0">
                  A
                </div>
                <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
                  <span className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input bar */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 flex items-center px-4 py-2 gap-2">
          <input
            ref={inputRef}
            value={query}
            disabled={loading}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 border-none outline-none px-2 py-2 text-sm bg-transparent text-zinc-900 dark:text-white placeholder:text-zinc-400"
            placeholder="Ask anything about BYU–Hawaii..."
            aria-label="Chat input"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !query.trim()}
            aria-label="Send message"
            className="bg-[#8b1538] hover:bg-[#7a1230] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2 text-sm font-medium transition-colors shrink-0"
          >
            {loading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}